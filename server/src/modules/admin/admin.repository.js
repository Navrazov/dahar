import { config } from '../../config.js'
import { query } from '../../db/pool.js'
import { hashPassword } from '../../lib/crypto.js'

export async function findAdminByLogin(login) {
  const { rows } = await query('SELECT * FROM admins WHERE lower(login) = lower($1)', [String(login || '').trim()])
  return rows[0] ?? null
}

export async function findAdminBySession(tokenHash) {
  const { rows } = await query(
    `SELECT a.id, a.login, a.last_login_at FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash],
  )
  return rows[0] ?? null
}

export async function findAdminById(id) {
  const { rows } = await query('SELECT * FROM admins WHERE id = $1', [id])
  return rows[0] ?? null
}

export async function createAdmin(login, password) {
  const { rows } = await query('INSERT INTO admins (login, password_hash) VALUES ($1, $2) RETURNING id, login', [String(login).trim(), await hashPassword(password)])
  return rows[0]
}

export async function setAdminPassword(id, password) {
  await query('UPDATE admins SET password_hash = $1 WHERE id = $2', [await hashPassword(password), id])
}

export async function markAdminLogin(id) {
  await query('UPDATE admins SET last_login_at = now() WHERE id = $1', [id])
}

export async function listAdmins() {
  const { rows } = await query('SELECT id, login, last_login_at, created_at FROM admins ORDER BY id')
  return rows
}

export async function deleteAdmin(login) {
  const { rowCount } = await query('DELETE FROM admins WHERE lower(login) = lower($1)', [login])
  return rowCount > 0
}

export async function ensureBootstrapAdmin() {
  const { login, password } = config.admin
  if (!login || !password) return null
  if (await findAdminByLogin(login)) return null
  return createAdmin(login, password)
}

export function audit(req, action, target = null, meta = null) {
  return query('INSERT INTO admin_audit (admin_id, action, target, meta, ip) VALUES ($1, $2, $3, $4, $5)', [
    req.admin?.id ?? null,
    action,
    target == null ? null : String(target),
    meta ? JSON.stringify(meta) : null,
    req.ip ?? null,
  ])
}

export async function listAudit(limit = 200) {
  const { rows } = await query(
    `SELECT l.id, l.action, l.target, l.meta, l.ip, l.created_at, a.login AS admin
     FROM admin_audit l LEFT JOIN admins a ON a.id = l.admin_id
     ORDER BY l.id DESC LIMIT $1`,
    [limit],
  )
  return rows
}
