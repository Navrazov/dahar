import { findAdminBySession } from './admin.repository.js'
import { adminSessions } from './admin.sessions.js'

export async function requireAdmin(req, res, next) {
  const hash = adminSessions.tokenHash(req)
  req.admin = hash ? await findAdminBySession(hash) : null
  if (!req.admin) return res.status(401).json({ error: 'Требуется вход' })
  next()
}
