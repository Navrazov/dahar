import type { NextFunction, Request, Response } from 'express'
import { query } from '../../db/pool.ts'
import type { SessionUser } from '../../express.d.ts'
import { touchActivity } from '../users/users.repository.ts'
import { userSessions } from './user-sessions.ts'

export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const hash = userSessions.tokenHash(req)
  if (hash) {
    const { rows } = await query<SessionUser>(
      `SELECT u.id, u.login, u.name FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND u.blocked_at IS NULL`,
      [hash],
    )
    if (rows[0]) {
      req.user = rows[0]
      touchActivity(rows[0].id)
    }
  }
  next()
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Требуется вход' })
  next()
}
