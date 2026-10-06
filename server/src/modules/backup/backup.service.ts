import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import { decode, encode } from '../../db/codec.ts'
import { isDate } from '../../lib/time.ts'
import { badRequest } from '../../lib/errors.ts'
import { query, q, tx, type Db, type DbRow } from '../../db/pool.ts'
import { fieldsOf, isRef, tableOrder, type TableName } from '../../db/schema.ts'
import { fileAsDataUrl, storeFile, validateFile } from '../files/files.storage.ts'
import { insertRow } from '../records/records.repository.ts'
import { getSettings, replaceSettings } from '../settings/settings.repository.ts'

export const BACKUP_VERSION = 4

type Tables = Partial<Record<TableName, DbRow[]>>

export interface Backup {
  version?: number
  exported_at?: string
  data: Tables & { settings?: unknown }
  files?: Record<string, string | null>
  settings?: Record<string, unknown>
  insights?: DbRow[]
  imports?: DbRow[]
  category_rules?: DbRow[]
}

export async function exportBackup(userId: number, client?: Db): Promise<Backup> {
  if (!client)
    return tx(async (c) => {
      await query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', [], c)
      return exportBackup(userId, c)
    })
  const data: Tables = {}
  for (const t of tableOrder) {
    const { rows } = await query(`SELECT * FROM ${q(t)} WHERE user_id = $1 ORDER BY id`, [userId], client)
    data[t] = rows.map(decode)
  }
  const files: Record<string, string | null> = {}
  for (const t of data.trades ?? []) if (t.screenshot?.startsWith('/api/files/')) files[t.screenshot] = await fileAsDataUrl(userId, t.screenshot, client)
  const insights = (await query('SELECT week_start,content,model,created_at FROM weekly_insights WHERE user_id=$1', [userId], client)).rows
  const imports = (await query('SELECT key,transaction_id FROM statement_imports WHERE user_id=$1', [userId], client)).rows
  const rules = (await query('SELECT kind,merchant,category FROM category_rules WHERE user_id=$1', [userId], client)).rows
  return {
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    data,
    files,
    settings: await getSettings(userId, client),
    imports,
    insights,
    category_rules: rules,
  }
}

function legacySettings(data: Backup['data']): Record<string, unknown> | null {
  if (!Array.isArray(data.settings)) return null
  return Object.fromEntries(data.settings.map((r: { key: string; value: unknown }) => [r.key, typeof r.value === 'string' ? JSON.parse(r.value) : r.value]))
}

function parseJson(v: unknown) {
  if (typeof v !== 'string') return v
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}

type IdMap = Record<TableName, Map<number, number>>

function remapSetting(key: string, value: unknown, idMap: IdMap) {
  if (value == null) return value
  if (key.endsWith('_project_id')) return idMap.projects.get(Number(value)) ?? null
  if (key === 'default_account_id') return idMap.accounts.get(Number(value)) ?? null
  return value
}

export async function restoreBackup(userId: number, backup: Backup, client?: PoolClient) {
  validateBackup(backup)
  const data = backup.data
  const settings = backup.settings ?? legacySettings(data) ?? {}
  const files = backup.files || {}

  const run = async (c: PoolClient) => {
    await query('SELECT pg_advisory_xact_lock($1,$2)', [7262005, userId], c)
    await query('UPDATE users SET dataset_version=dataset_version+1 WHERE id=$1', [userId], c)
    const previous = await exportBackup(userId, c)
    await query('INSERT INTO saved_backups(user_id,data) VALUES($1,$2)', [userId, JSON.stringify(previous)], c)
    await query(
      'DELETE FROM saved_backups WHERE user_id=$1 AND id NOT IN (SELECT id FROM saved_backups WHERE user_id=$1 ORDER BY id DESC LIMIT 10)',
      [userId],
      c,
    )
    // Older undo actions reference IDs about to disappear.
    await query('UPDATE history_actions SET undone_at=now() WHERE user_id=$1 AND undone_at IS NULL', [userId], c)
    await query('DELETE FROM weekly_insights WHERE user_id=$1', [userId], c)
    await query('DELETE FROM category_rules WHERE user_id=$1', [userId], c)
    for (const t of [...tableOrder].reverse()) await query(`DELETE FROM ${q(t)} WHERE user_id = $1`, [userId], c)
    const idMap = Object.fromEntries(tableOrder.map((t) => [t, new Map<number, number>()])) as IdMap

    for (const t of tableOrder) {
      const rows = data[t]
      if (!Array.isArray(rows)) continue
      for (const row of rows) {
        const body: DbRow = { ...row }
        for (const [col, def] of fieldsOf(t)) {
          if (isRef(def) && body[col] != null) body[col] = idMap[def.ref as TableName].get(Number(body[col])) ?? null
          if (def.type === 'weekdays') body[col] = parseJson(body[col])
        }
        if (t === 'trades' && body.screenshot) {
          const src = String(body.screenshot).startsWith('data:') ? body.screenshot : files[body.screenshot]
          body.screenshot = src ? await storeFile(userId, src, c) : null
        }
        const encoded = encode(t, body, { internal: true })
        if (t === 'events' && !encoded.external_uid) encoded.external_uid = randomUUID() + '@dahar'
        if (t === 'accounts') encoded.import_identity = row.import_identity || String(row.id)
        if (row.created_at && !Number.isNaN(Date.parse(row.created_at))) encoded.created_at = row.created_at
        const inserted = await insertRow(t, encoded, userId, c)
        idMap[t].set(Number(row.id), inserted.id)
      }
    }

    for (const item of backup.imports ?? []) {
      const id = idMap.transactions.get(Number(item.transaction_id))
      if (id) await query('INSERT INTO statement_imports(user_id,key,transaction_id) VALUES($1,$2,$3)', [userId, item.key, id], c)
    }
    for (const rule of backup.category_rules ?? [])
      await query('INSERT INTO category_rules(user_id,kind,merchant,category) VALUES($1,$2,$3,$4)', [userId, rule.kind, rule.merchant, rule.category], c)
    for (const insight of backup.insights ?? [])
      await query(
        'INSERT INTO weekly_insights(user_id,week_start,content,model,created_at) VALUES($1,$2,$3,$4,$5)',
        [userId, insight.week_start, JSON.stringify(insight.content), insight.model, insight.created_at],
        c,
      )
    await replaceSettings(
      userId,
      Object.entries(settings).map(([key, value]): [string, unknown] => [key, remapSetting(key, value, idMap)]),
      c,
    )
  }
  return client ? run(client) : tx(run)
}

/** Reject partial/foreign JSON instead of silently erasing omitted tables. */
export function validateBackup(value: unknown) {
  const b = value as Backup
  if (!b || typeof b !== 'object' || ![3, 4].includes(b.version ?? 0) || !b.data || typeof b.data !== 'object')
    throw badRequest('Нужна полная резервная копия Dahar версии 3 или 4')
  if (b.files != null && (typeof b.files !== 'object' || Array.isArray(b.files))) throw badRequest('Повреждены изображения')
  for (const image of Object.values(b.files ?? {})) if (image !== null) validateFile(image)
  const counts: Record<string, number> = {}
  const ids = new Map<string, Set<number>>()
  for (const t of tableOrder) {
    const rows = b.data[t]
    if (!Array.isArray(rows) || rows.length > 100000) throw badRequest(`Копия не содержит корректный раздел ${t}`)
    const set = new Set<number>()
    for (const row of rows) {
      if (!row || !Number.isInteger(row.id) || row.id <= 0 || set.has(row.id)) throw badRequest(`Некорректный ID в разделе ${t}`)
      if (t === 'events' && row.external_uid && /[\r\n]/.test(row.external_uid)) throw badRequest('Повреждён идентификатор события')
      set.add(row.id)
      encode(t, row, { internal: true })
      if (t === 'trades' && row.screenshot?.startsWith('data:')) validateFile(row.screenshot)
      if (row.created_at && (typeof row.created_at !== 'string' || Number.isNaN(Date.parse(row.created_at)))) throw badRequest('Повреждена дата создания')
      if (t === 'accounts' && row.import_identity != null && (typeof row.import_identity !== 'string' || row.import_identity.length > 100))
        throw badRequest('Повреждена история счёта')
    }
    ids.set(t, set)
    counts[t] = rows.length
  }
  for (const t of tableOrder)
    for (const row of b.data[t]!)
      for (const [col, def] of fieldsOf(t))
        if (isRef(def) && row[col] != null && !ids.get(def.ref)?.has(Number(row[col]))) throw badRequest(`Повреждённая связь ${t}.${col}`)
  if (b.settings != null && (typeof b.settings !== 'object' || Array.isArray(b.settings))) throw badRequest('Повреждены настройки')
  if (b.version === 4 && (!Array.isArray(b.imports) || !Array.isArray(b.category_rules))) throw badRequest('Повреждена история финансового импорта')
  for (const item of b.imports ?? [])
    if (!/^[0-9a-f]{32}$/.test(item.key) || !ids.get('transactions')?.has(Number(item.transaction_id))) throw badRequest('Повреждена история импорта')
  for (const rule of b.category_rules ?? [])
    if (!['income', 'expense'].includes(rule.kind) || typeof rule.merchant !== 'string' || typeof rule.category !== 'string' || rule.category.length > 200)
      throw badRequest('Повреждены правила категорий')
  if (b.insights !== undefined && !Array.isArray(b.insights)) throw badRequest('Повреждены разборы недели')
  const weeks = new Set<string>()
  for (const insight of b.insights ?? []) {
    const content = insight.content
    if (
      !isDate(insight.week_start) ||
      weeks.has(insight.week_start) ||
      typeof insight.model !== 'string' ||
      insight.model.length > 100 ||
      typeof insight.created_at !== 'string' ||
      Number.isNaN(Date.parse(insight.created_at)) ||
      !content ||
      ['summary', 'money', 'habits'].some((k) => typeof content[k] !== 'string' || content[k].length > 20000) ||
      ['wins', 'attention', 'next_week'].some(
        (k) => !Array.isArray(content[k]) || content[k].length > 100 || content[k].some((v: unknown) => typeof v !== 'string' || v.length > 20000),
      )
    )
      throw badRequest('Повреждены разборы недели')
    weeks.add(insight.week_start)
  }
  for (const [name, rows, keyOf] of [
    ['events', b.data.events, (r: DbRow) => r.external_uid],
    ['accounts', b.data.accounts, (r: DbRow) => r.import_identity],
    ['habit_logs', b.data.habit_logs, (r: DbRow) => `${r.habit_id}:${r.date}`],
    ['reviews', b.data.reviews, (r: DbRow) => r.week_start],
    ['budgets', b.data.budgets, (r: DbRow) => r.category],
    ['imports', b.imports, (r: DbRow) => r.key],
    ['category_rules', b.category_rules, (r: DbRow) => `${r.kind}:${r.merchant}`],
  ] as [string, DbRow[] | undefined, (r: DbRow) => string | null][]) {
    const set = new Set<string>()
    for (const row of rows ?? []) {
      const key = keyOf(row)
      if (key == null) continue
      if (set.has(key)) throw badRequest(`Повторяющиеся записи в разделе ${name}`)
      set.add(key)
    }
  }
  for (const row of b.data.transactions!)
    if (row.kind === 'transfer' && (!row.account_id || !row.to_account_id || row.account_id === row.to_account_id))
      throw badRequest('Повреждён перевод между счетами')
  for (const row of b.data.events!) if (row.end && row.end < row.start) throw badRequest('Повреждён период события')
  return { version: b.version, exported_at: b.exported_at, counts, total: Object.values(counts).reduce((a, n) => a + n, 0) }
}
