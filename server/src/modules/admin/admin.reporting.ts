import { pool, q, query } from '../../db/pool.ts'
import { tableOrder } from '../../db/schema.ts'
import { nowIn } from '../../lib/time.ts'

export const bounded = (value: unknown, fallback: number, max: number) => {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), max) : fallback
}
export const searchTerm = (value: unknown) =>
  String(value ?? '')
    .trim()
    .slice(0, 100)
export const like = (value: unknown) => `%${searchTerm(value).replace(/[\\%_]/g, '\\$&')}%`
export const pagination = (params: Record<string, unknown>) => ({
  limit: Math.max(1, bounded(params.limit, 50, 100)),
  offset: bounded(params.offset, 0, 1_000_000),
})

export async function usersPage(params: Record<string, unknown>) {
  const { limit, offset } = pagination(params)
  const args: unknown[] = []
  const conditions: string[] = []
  if (searchTerm(params.q)) {
    args.push(like(params.q))
    conditions.push(`(u.login ILIKE $${args.length} OR u.name ILIKE $${args.length})`)
  }
  const filters: Record<string, string> = {
    active: "u.blocked_at IS NULL AND u.last_seen_at > now() - interval '7 days'",
    idle: "u.blocked_at IS NULL AND (u.last_seen_at IS NULL OR u.last_seen_at <= now() - interval '30 days')",
    blocked: 'u.blocked_at IS NOT NULL',
    telegram: 'u.telegram_chat_id IS NOT NULL',
    secure: 'u.totp_secret IS NOT NULL',
  }
  const filter = filters[String(params.filter)]
  if (filter) conditions.push(filter)
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const orders: Record<string, string> = {
    newest: 'u.created_at DESC, u.id DESC',
    oldest: 'u.created_at, u.id',
    seen: 'u.last_seen_at DESC NULLS LAST, u.id DESC',
    login: 'u.login, u.id',
  }
  const order = orders[String(params.sort)] ?? orders.newest
  const [count, summary, page] = await Promise.all([
    query(`SELECT count(*)::int AS total FROM users u ${where}`, args),
    query(`SELECT count(*)::int AS total,
      count(*) FILTER(WHERE blocked_at IS NOT NULL)::int AS blocked,
      count(*) FILTER(WHERE blocked_at IS NULL AND last_seen_at > now()-interval '7 days')::int AS active,
      count(*) FILTER(WHERE blocked_at IS NULL AND (last_seen_at IS NULL OR last_seen_at <= now()-interval '30 days'))::int AS idle,
      count(*) FILTER(WHERE telegram_chat_id IS NOT NULL)::int AS telegram,
      count(*) FILTER(WHERE totp_secret IS NOT NULL)::int AS secure FROM users`),
    query(
      `SELECT u.id,u.login,u.name,u.created_at,u.last_seen_at,u.blocked_at,
      u.telegram_chat_id IS NOT NULL AS telegram,u.totp_secret IS NOT NULL AS two_factor
      FROM users u ${where} ORDER BY ${order} LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
      [...args, limit, offset],
    ),
  ])
  const ids = page.rows.map((u) => u.id)
  if (!ids.length) return { items: [], total: count.rows[0].total, summary: summary.rows[0], limit, offset }
  const [records, extra] = await Promise.all([
    query(
      `SELECT user_id,sum(n)::int AS records FROM (${tableOrder.map((t) => `SELECT user_id,count(*)::int AS n FROM ${q(t)} WHERE user_id=ANY($1::int[]) GROUP BY user_id`).join(' UNION ALL ')}) c GROUP BY user_id`,
      [ids],
    ),
    query(
      `SELECT u.id,
      (SELECT count(*) FROM sessions s WHERE s.user_id=u.id AND s.expires_at>now())::int AS sessions,
      (SELECT count(*) FROM user_activity a WHERE a.user_id=u.id AND a.day>$2::date-30)::int AS active_days,
      (SELECT COALESCE(sum(size),0) FROM files f WHERE f.user_id=u.id)::bigint AS files_size
      FROM users u WHERE u.id=ANY($1::int[])`,
      [ids, nowIn().date],
    ),
  ])
  const totals = new Map(records.rows.map((r) => [r.user_id, r.records]))
  const details = new Map(extra.rows.map((r) => [r.id, r]))
  return {
    items: page.rows.map((u) => ({ ...u, ...details.get(u.id), records: totals.get(u.id) ?? 0 })),
    total: count.rows[0].total,
    summary: summary.rows[0],
    limit,
    offset,
  }
}

export async function auditPage(params: Record<string, unknown>) {
  const { limit, offset } = pagination(params)
  const args: unknown[] = []
  const conditions: string[] = []
  if (searchTerm(params.q)) {
    args.push(like(params.q))
    conditions.push(`(l.target ILIKE $${args.length} OR a.login ILIKE $${args.length} OR l.action ILIKE $${args.length})`)
  }
  if (searchTerm(params.action)) {
    args.push(searchTerm(params.action))
    conditions.push(`l.action=$${args.length}`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const from = 'FROM admin_audit l LEFT JOIN admins a ON a.id=l.admin_id'
  const [items, count, actions] = await Promise.all([
    query(
      `SELECT l.id,l.action,l.target,l.meta,l.ip,l.created_at,a.login AS admin ${from} ${where} ORDER BY l.id DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
      [...args, limit, offset],
    ),
    query(`SELECT count(*)::int AS total ${from} ${where}`, args),
    query('SELECT action,count(*)::int AS total FROM admin_audit GROUP BY action ORDER BY total DESC'),
  ])
  return { items: items.rows, total: count.rows[0].total, actions: actions.rows, limit, offset }
}

export async function operations() {
  const [deliveries, db, users] = await Promise.all([
    query(`SELECT channel,count(*)::int AS total,
      count(*) FILTER(WHERE delivered_at IS NOT NULL)::int AS delivered,
      count(*) FILTER(WHERE delivered_at>now()-interval '24 hours')::int AS delivered24,
      count(*) FILTER(WHERE delivered_at IS NULL AND attempts<5)::int AS pending,
      count(*) FILTER(WHERE delivered_at IS NULL AND attempts>=5)::int AS failed,
      count(*) FILTER(WHERE delivered_at IS NULL AND attempts<5 AND next_attempt_at<=now())::int AS due
      FROM notification_deliveries GROUP BY channel ORDER BY channel`),
    query(`SELECT numbackends::int AS connections,xact_commit,xact_rollback,deadlocks,
      CASE WHEN blks_hit+blks_read=0 THEN NULL ELSE round(100.0*blks_hit/(blks_hit+blks_read),2) END AS cache_hit,
      stats_reset FROM pg_stat_database WHERE datname=current_database()`),
    query(`SELECT count(*) FILTER(WHERE totp_secret IS NOT NULL)::int AS two_factor,
      count(*) FILTER(WHERE last_seen_at IS NULL)::int AS never_seen,
      (SELECT count(DISTINCT user_id) FROM product_events WHERE event='first_completion')::int AS completed,
      (SELECT count(DISTINCT user_id) FROM product_events WHERE event='onboarding_completed')::int AS onboarded,
      (SELECT count(*) FROM push_subscriptions)::int AS push_subscriptions,
      (SELECT count(*) FROM saved_backups)::int AS backups,
      (SELECT count(*) FROM history_actions WHERE created_at>now()-interval '7 days')::int AS changes7
      FROM users`),
  ])
  return {
    deliveries: deliveries.rows,
    database: db.rows[0],
    pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount, max: pool.options.max },
    users: users.rows[0],
    sampled_at: new Date().toISOString(),
  }
}
