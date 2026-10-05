import { decode, encode } from '../../db/codec.js'
import { query, q, tx } from '../../db/pool.js'
import { schema, isRef, tableOrder } from '../../db/schema.js'
import { fileAsDataUrl, storeFile } from '../files/files.storage.js'
import { insertRow } from '../records/records.repository.js'
import { getSettings, replaceSettings } from '../settings/settings.repository.js'

export const BACKUP_VERSION = 3

export async function exportBackup(userId) {
  const data = {}
  for (const t of tableOrder) {
    const { rows } = await query(`SELECT * FROM ${q(t)} WHERE user_id = $1 ORDER BY id`, [userId])
    data[t] = rows.map(decode)
  }
  const files = {}
  for (const t of data.trades) if (t.screenshot?.startsWith('/api/files/')) files[t.screenshot] = await fileAsDataUrl(userId, t.screenshot)
  return { version: BACKUP_VERSION, exported_at: new Date().toISOString(), data, files, settings: await getSettings(userId) }
}

function legacySettings(data) {
  if (!Array.isArray(data.settings)) return null
  return Object.fromEntries(data.settings.map((r) => [r.key, typeof r.value === 'string' ? JSON.parse(r.value) : r.value]))
}

function parseJson(v) {
  if (typeof v !== 'string') return v
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}

function remapSetting(key, value, idMap) {
  if (value == null) return value
  if (key.endsWith('_project_id')) return idMap.projects.get(Number(value)) ?? null
  if (key === 'default_account_id') return idMap.accounts.get(Number(value)) ?? null
  return value
}

export async function restoreBackup(userId, backup) {
  const data = backup.data
  const settings = backup.settings ?? legacySettings(data) ?? {}
  const files = backup.files || {}

  await tx(async (c) => {
    for (const t of [...tableOrder].reverse()) await query(`DELETE FROM ${q(t)} WHERE user_id = $1`, [userId], c)
    const idMap = Object.fromEntries(tableOrder.map((t) => [t, new Map()]))

    for (const t of tableOrder) {
      for (const row of data[t] || []) {
        const body = { ...row }
        for (const [col, type] of Object.entries(schema[t])) {
          if (isRef(type) && body[col] != null) body[col] = idMap[type.ref].get(Number(body[col])) ?? null
          if (type === 'json') body[col] = parseJson(body[col])
        }
        if (t === 'trades' && body.screenshot) {
          const src = body.screenshot.startsWith('data:') ? body.screenshot : files[body.screenshot]
          body.screenshot = src ? await storeFile(userId, src, c) : null
        }
        const encoded = encode(t, body)
        if (row.created_at && !Number.isNaN(Date.parse(row.created_at))) encoded.created_at = row.created_at
        const inserted = await insertRow(t, encoded, userId, c)
        idMap[t].set(Number(row.id), inserted.id)
      }
    }

    await replaceSettings(userId, Object.entries(settings).map(([key, value]) => [key, remapSetting(key, value, idMap)]), c)
  })
}
