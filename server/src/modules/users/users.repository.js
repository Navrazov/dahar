import { query } from '../../db/pool.js'
import { hashPassword } from '../../lib/crypto.js'
import { nowIn } from '../../lib/time.js'

export const LOGIN_PATTERN = /^[a-z0-9._-]{2,32}$/

export const normalizeLogin = (s) => String(s || '').trim().toLowerCase()

export async function findByLogin(login) {
  const { rows } = await query('SELECT * FROM users WHERE login = $1', [normalizeLogin(login)])
  return rows[0] ?? null
}

export async function findById(id) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id])
  return rows[0] ?? null
}

export async function createUser({ login, password, name }) {
  const { rows } = await query(
    'INSERT INTO users (login, password_hash, name) VALUES ($1, $2, $3) RETURNING id, login, name, created_at',
    [normalizeLogin(login), await hashPassword(password), name || normalizeLogin(login)],
  )
  return rows[0]
}

export async function setPassword(id, password, { keepSession = null } = {}) {
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(password), id])
  await query('DELETE FROM sessions WHERE user_id = $1 AND token_hash IS DISTINCT FROM $2', [id, keepSession])
}

export async function deleteUser(id) {
  const { rowCount } = await query('DELETE FROM users WHERE id = $1', [id])
  return rowCount > 0
}

const touched = new Map()

export function touchActivity(userId) {
  const day = nowIn().date
  const last = touched.get(userId)
  if (last && last.day === day && Date.now() - last.at < 5 * 60_000) return
  touched.set(userId, { day, at: Date.now() })
  Promise.all([
    query('UPDATE users SET last_seen_at = now() WHERE id = $1', [userId]),
    query('INSERT INTO user_activity (user_id, day) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, day]),
  ]).catch(() => touched.delete(userId))
}
