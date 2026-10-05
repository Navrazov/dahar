import { readFileSync } from 'node:fs'
import { config } from '../../config.ts'
import { dbLabel, query, q, type DbRow } from '../../db/pool.ts'
import { tableOrder } from '../../db/schema.ts'
import { migrations } from '../../db/migrations.ts'
import { addDays, DEFAULT_TZ, nowIn } from '../../lib/time.ts'
import { storageLabel } from '../files/files.storage.ts'
import { sentryEnabled } from '../monitoring/monitoring.ts'
import { botInfo } from '../telegram/transport.ts'
import { schedulerState } from '../../jobs/scheduler.ts'

const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'))

export const MODULES = [
  { key: 'habits', default: true },
  { key: 'finance', default: true },
  { key: 'calculator', default: false },
  { key: 'partners', default: false },
  { key: 'trading', default: false },
  { key: 'business', default: false },
]

const allRecordsSql = (cols: string) => tableOrder.map((t) => `SELECT ${cols}, '${t}' AS collection FROM ${q(t)}`).join(' UNION ALL ')

const today = () => nowIn().date

function fillDays(days: number, rows: DbRow[], key: string) {
  const map = new Map<string, number>(rows.map((r) => [r.day, Number(r[key])]))
  const end = today()
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(end, i - days + 1)
    return { day, value: map.get(day) ?? 0 }
  })
}

const zone = /^[A-Za-z0-9_/+-]+$/.test(DEFAULT_TZ) ? DEFAULT_TZ : 'UTC'

const dayExpr = (col: string) => `to_char(${col} AT TIME ZONE '${zone}', 'YYYY-MM-DD')`

export async function overview() {
  const d = today()
  const [totals, collections, signups, active, created, modules, activation] = await Promise.all([
    query(
      `SELECT
         (SELECT count(*) FROM users)::int AS users,
         (SELECT count(*) FROM users WHERE created_at > now() - interval '7 days')::int AS new7,
         (SELECT count(*) FROM users WHERE created_at > now() - interval '30 days')::int AS new30,
         (SELECT count(*) FROM users WHERE blocked_at IS NOT NULL)::int AS blocked,
         (SELECT count(*) FROM users WHERE telegram_chat_id IS NOT NULL)::int AS telegram,
         (SELECT count(*) FROM user_activity WHERE day = $1::date)::int AS dau,
         (SELECT count(DISTINCT user_id) FROM user_activity WHERE day > $1::date - 7)::int AS wau,
         (SELECT count(DISTINCT user_id) FROM user_activity WHERE day > $1::date - 30)::int AS mau,
         (SELECT count(*) FROM sessions WHERE expires_at > now())::int AS sessions,
         (SELECT count(*) FROM files)::int AS files,
         (SELECT COALESCE(sum(size), 0) FROM files)::bigint AS files_size,
         pg_database_size(current_database())::bigint AS db_size,
         (SELECT count(*) FROM error_log WHERE created_at > now() - interval '24 hours')::int AS errors24`,
      [d],
    ),
    query(
      `SELECT collection, count(*)::int AS total,
              count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS week
       FROM (${allRecordsSql('created_at')}) x GROUP BY collection ORDER BY total DESC`,
    ),
    query(`SELECT ${dayExpr('created_at')} AS day, count(*) AS n FROM users WHERE created_at > now() - interval '90 days' GROUP BY 1`),
    query(`SELECT to_char(day, 'YYYY-MM-DD') AS day, count(*) AS n FROM user_activity WHERE day > $1::date - 90 GROUP BY 1`, [d]),
    query(
      `SELECT ${dayExpr('created_at')} AS day, count(*) AS n FROM (${allRecordsSql('created_at')}) x WHERE created_at > now() - interval '90 days' GROUP BY 1`,
    ),
    query(`SELECT s.value FROM users u LEFT JOIN settings s ON s.user_id = u.id AND s.key = 'modules'`),
    query('SELECT event,count(*)::int AS users FROM product_events GROUP BY event'),
  ])

  const adoption = MODULES.map((m) => ({
    key: m.key,
    users: modules.rows.filter((r) => r.value?.[m.key]?.enabled ?? m.default).length,
  }))

  const signupSeries = fillDays(90, signups.rows, 'n')
  const activeSeries = fillDays(90, active.rows, 'n')
  const createdSeries = fillDays(90, created.rows, 'n')

  return {
    totals: { ...totals.rows[0], records: collections.rows.reduce((a, r) => a + r.total, 0), records7: collections.rows.reduce((a, r) => a + r.week, 0) },
    collections: collections.rows,
    adoption,
    activation: activation.rows,
    daily: signupSeries.map((s, i) => ({ day: s.day, signups: s.value, active: activeSeries[i].value, records: createdSeries[i].value })),
  }
}

async function recordCounts(userId?: number) {
  const { rows } = await query(
    `SELECT user_id, collection, count(*)::int AS n FROM (${allRecordsSql('user_id')}) x
     ${userId ? 'WHERE user_id = $1' : ''} GROUP BY user_id, collection`,
    userId ? [userId] : [],
  )
  return rows
}

export async function listUsers() {
  const [users, counts] = await Promise.all([
    query(
      `SELECT u.id, u.login, u.name, u.created_at, u.last_seen_at, u.blocked_at,
              u.telegram_chat_id IS NOT NULL AS telegram,
              (SELECT count(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > now())::int AS sessions,
              (SELECT count(*) FROM user_activity a WHERE a.user_id = u.id AND a.day > $1::date - 30)::int AS active_days,
              (SELECT COALESCE(sum(size), 0) FROM files f WHERE f.user_id = u.id)::bigint AS files_size
       FROM users u ORDER BY u.id`,
      [today()],
    ),
    recordCounts(),
  ])
  const totals = new Map<number, number>()
  for (const r of counts) totals.set(r.user_id, (totals.get(r.user_id) ?? 0) + r.n)
  return users.rows.map((u) => ({ ...u, records: totals.get(u.id) ?? 0 }))
}

export async function userDetail(id: number) {
  const d = today()
  const { rows } = await query(
    `SELECT u.id, u.login, u.name, u.created_at, u.last_seen_at, u.blocked_at, u.telegram_chat_id IS NOT NULL AS telegram,
            (SELECT COALESCE(sum(size), 0) FROM files f WHERE f.user_id = u.id)::bigint AS files_size,
            (SELECT count(*) FROM files f WHERE f.user_id = u.id)::int AS files
     FROM users u WHERE u.id = $1`,
    [id],
  )
  if (!rows[0]) return null
  const [counts, activity, sessions, settings, lastRecord] = await Promise.all([
    recordCounts(id),
    query(`SELECT to_char(day, 'YYYY-MM-DD') AS day, 1 AS n FROM user_activity WHERE user_id = $1 AND day > $2::date - 182`, [id, d]),
    query(`SELECT created_at, expires_at, ip, user_agent FROM sessions WHERE user_id = $1 AND expires_at > now() ORDER BY created_at DESC`, [id]),
    query(`SELECT key, value FROM settings WHERE user_id = $1 AND key IN ('modules', 'timezone', 'currency', 'digest_hour', 'reminders_enabled')`, [id]),
    query(`SELECT max(created_at) AS at FROM (${allRecordsSql('user_id, created_at')}) x WHERE user_id = $1`, [id]),
  ])
  const prefs = Object.fromEntries(settings.rows.map((r) => [r.key, r.value]))
  return {
    ...rows[0],
    last_record_at: lastRecord.rows[0]?.at ?? null,
    collections: counts.map(({ collection, n }) => ({ collection, total: n })).sort((a, b) => b.total - a.total),
    activity: fillDays(182, activity.rows, 'n'),
    sessions: sessions.rows,
    timezone: prefs.timezone ?? null,
    currency: prefs.currency ?? null,
    modules: MODULES.filter((m) => prefs.modules?.[m.key]?.enabled ?? m.default).map((m) => m.key),
  }
}

export async function systemInfo() {
  const [db, tables, applied] = await Promise.all([
    query(`SELECT pg_database_size(current_database())::bigint AS size, current_setting('server_version') AS version`),
    query(
      `SELECT c.relname AS name, pg_total_relation_size(c.oid)::bigint AS size, c.reltuples::bigint AS rows
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 2 DESC LIMIT 30`,
    ),
    query('SELECT id, applied_at FROM schema_migrations ORDER BY id'),
  ])
  const mem = process.memoryUsage()
  const appliedIds = new Set(applied.rows.map((r) => r.id))
  return {
    app: { name: pkg.name, version: pkg.version ?? null },
    node: process.version,
    uptime: Math.round(process.uptime()),
    memory: { rss: mem.rss, heap: mem.heapUsed },
    timezone: DEFAULT_TZ,
    database: { label: dbLabel, size: db.rows[0].size, version: db.rows[0].version, tables: tables.rows },
    migrations: { applied: applied.rows, pending: migrations.filter((m) => !appliedIds.has(m.id)).map((m) => m.id) },
    storage: storageLabel(),
    telegram: botInfo(),
    sentry: sentryEnabled(),
    scheduler: schedulerState(),
    role: config.role,
  }
}

export async function listErrors({ source, limit = 100 }: { source?: unknown; limit?: unknown }) {
  const params: unknown[] = [Math.min(Math.max(Number(limit) || 100, 1), 500)]
  const where = source === 'client' || source === 'server' ? `WHERE e.source = $2` : ''
  if (where) params.push(source)
  const [items, daily] = await Promise.all([
    query(
      `SELECT e.id, e.source, e.message, e.stack, e.context, e.created_at, u.login AS user
       FROM error_log e LEFT JOIN users u ON u.id = e.user_id ${where} ORDER BY e.id DESC LIMIT $1`,
      params,
    ),
    query(`SELECT ${dayExpr('created_at')} AS day, count(*) AS n FROM error_log WHERE created_at > now() - interval '30 days' GROUP BY 1`),
  ])
  return { items: items.rows, daily: fillDays(30, daily.rows, 'n') }
}

export async function clearErrors() {
  const { rowCount } = await query('DELETE FROM error_log')
  return rowCount
}

export async function retention(weeks = 12) {
  const [sizes, active, top] = await Promise.all([
    query(
      `SELECT to_char(date_trunc('week', created_at AT TIME ZONE '${zone}'), 'YYYY-MM-DD') AS cohort, count(*)::int AS size
       FROM users WHERE created_at > now() - make_interval(weeks => $1) GROUP BY 1 ORDER BY 1`,
      [weeks],
    ),
    query(
      `SELECT to_char(date_trunc('week', u.created_at AT TIME ZONE '${zone}'), 'YYYY-MM-DD') AS cohort,
              ((date_trunc('week', a.day)::date - date_trunc('week', u.created_at AT TIME ZONE '${zone}')::date) / 7)::int AS week,
              count(DISTINCT a.user_id)::int AS users
       FROM users u JOIN user_activity a ON a.user_id = u.id
       WHERE u.created_at > now() - make_interval(weeks => $1)
       GROUP BY 1, 2`,
      [weeks],
    ),
    query(
      `SELECT u.id, u.login, u.name, count(a.day)::int AS days
       FROM users u JOIN user_activity a ON a.user_id = u.id AND a.day > $1::date - 30
       GROUP BY u.id ORDER BY days DESC, u.id LIMIT 10`,
      [today()],
    ),
  ])
  const cohorts = sizes.rows.map((c) => ({
    cohort: c.cohort,
    size: c.size,
    weeks: Array.from({ length: weeks }, (_, w) => active.rows.find((r) => r.cohort === c.cohort && r.week === w)?.users ?? null),
  }))
  return { cohorts, top: top.rows }
}
