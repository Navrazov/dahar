import { query, tx, type DbRow } from '../../db/pool.ts'
import { hashPassword } from '../../lib/crypto.ts'
import { nowIn } from '../../lib/time.ts'

export const LOGIN_PATTERN = /^[a-z0-9._-]{2,32}$/

export const normalizeLogin = (s: unknown) =>
  String(s || '')
    .trim()
    .toLowerCase()

export async function findByLogin(login: unknown): Promise<DbRow | null> {
  const { rows } = await query('SELECT * FROM users WHERE login = $1', [normalizeLogin(login)])
  return rows[0] ?? null
}

export async function findById(id: number): Promise<DbRow | null> {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id])
  return rows[0] ?? null
}

export async function createUser({ login, password, name }: { login: string; password: string; name?: string | null }) {
  const { rows } = await query(
    "INSERT INTO users (login, password_hash, name, trial_ends_at) VALUES ($1, $2, $3, now() + interval '14 days') RETURNING id, login, name, created_at",
    [normalizeLogin(login), await hashPassword(password), name || normalizeLogin(login)],
  )
  return rows[0]
}

export async function setPassword(id: number, password: string, { keepSession = null }: { keepSession?: string | null } = {}) {
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(password), id])
  await query('DELETE FROM sessions WHERE user_id = $1 AND token_hash IS DISTINCT FROM $2', [id, keepSession])
}

export async function deleteUser(id: number) {
  return tx(async (c) => {
    await query('SELECT pg_advisory_xact_lock($1,$2)', [7262005, id], c)
    await query(
      'INSERT INTO file_deletions(storage_key) SELECT storage_key FROM files WHERE user_id=$1 AND storage_key IS NOT NULL ON CONFLICT DO NOTHING',
      [id],
      c,
    )
    const { rowCount } = await query('DELETE FROM users WHERE id=$1', [id], c)
    return (rowCount ?? 0) > 0
  })
}

const touched = new Map<number, { day: string; at: number }>()

export function touchActivity(userId: number) {
  const day = nowIn().date
  const last = touched.get(userId)
  if (last && last.day === day && Date.now() - last.at < 5 * 60_000) return
  touched.set(userId, { day, at: Date.now() })
  Promise.all([
    query('UPDATE users SET last_seen_at = now() WHERE id = $1', [userId]),
    query('INSERT INTO user_activity (user_id, day) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, day]),
  ]).catch(() => touched.delete(userId))
}
