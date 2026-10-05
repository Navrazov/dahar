import { query } from '../../db/pool.js'
import { nowIn } from '../../lib/time.js'

export async function getSetting(userId, key, client) {
  const { rows } = await query('SELECT value FROM settings WHERE user_id = $1 AND key = $2', [userId, key], client)
  return rows[0]?.value ?? null
}

export async function getSettings(userId, client) {
  const { rows } = await query('SELECT key, value FROM settings WHERE user_id = $1', [userId], client)
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export async function putSetting(userId, key, value, client) {
  await query(
    `INSERT INTO settings (user_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value`,
    [userId, key, JSON.stringify(value)],
    client,
  )
}

export async function replaceSettings(userId, entries, client) {
  await query('DELETE FROM settings WHERE user_id = $1', [userId], client)
  for (const [key, value] of entries) await putSetting(userId, key, value, client)
}

export async function userNow(userId, client) {
  return nowIn(await getSetting(userId, 'timezone', client))
}
