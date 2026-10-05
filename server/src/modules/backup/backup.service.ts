import { decode, encode } from '../../db/codec.ts'
import { query, q, tx, type DbRow } from '../../db/pool.ts'
import { fieldsOf, isRef, tableOrder, type TableName } from '../../db/schema.ts'
import { fileAsDataUrl, storeFile } from '../files/files.storage.ts'
import { insertRow } from '../records/records.repository.ts'
import { getSettings, replaceSettings } from '../settings/settings.repository.ts'

export const BACKUP_VERSION = 3

type Tables = Partial<Record<TableName, DbRow[]>>

export interface Backup {
  version?: number
  exported_at?: string
  data: Tables & { settings?: unknown }
  files?: Record<string, string | null>
  settings?: Record<string, unknown>
}

export async function exportBackup(userId: number): Promise<Backup> {
  const data: Tables = {}
  for (const t of tableOrder) {
    const { rows } = await query(`SELECT * FROM ${q(t)} WHERE user_id = $1 ORDER BY id`, [userId])
    data[t] = rows.map(decode)
  }
  const files: Record<string, string | null> = {}
  for (const t of data.trades ?? []) if (t.screenshot?.startsWith('/api/files/')) files[t.screenshot] = await fileAsDataUrl(userId, t.screenshot)
  return { version: BACKUP_VERSION, exported_at: new Date().toISOString(), data, files, settings: await getSettings(userId) }
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

export async function restoreBackup(userId: number, backup: Backup) {
  const data = backup.data
  const settings = backup.settings ?? legacySettings(data) ?? {}
  const files = backup.files || {}

  await tx(async (c) => {
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
        const encoded = encode(t, body, { lenient: true, internal: true })
        if (row.created_at && !Number.isNaN(Date.parse(row.created_at))) encoded.created_at = row.created_at
        const inserted = await insertRow(t, encoded, userId, c)
        idMap[t].set(Number(row.id), inserted.id)
      }
    }

    await replaceSettings(
      userId,
      Object.entries(settings).map(([key, value]): [string, unknown] => [key, remapSetting(key, value, idMap)]),
      c,
    )
  })
}
