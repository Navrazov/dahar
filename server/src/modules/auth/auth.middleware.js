import { query } from '../../db/pool.js'
import { touchActivity } from '../users/users.repository.js'
import { userSessions } from './user-sessions.js'

export async function loadUser(req, _res, next) {
  const hash = userSessions.tokenHash(req)
  if (hash) {
    const { rows } = await query(
      `SELECT u.id, u.login, u.name FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND u.blocked_at IS NULL`,
      [hash],
    )
    req.user = rows[0]
    if (req.user) touchActivity(req.user.id)
  }
  next()
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Требуется вход' })
  next()
}
