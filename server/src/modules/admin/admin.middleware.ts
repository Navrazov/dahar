import type { NextFunction, Request, Response } from 'express'
import { findAdminBySession } from './admin.repository.ts'
import { adminSessions } from './admin.sessions.ts'

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const hash = adminSessions.tokenHash(req)
  const admin = hash ? await findAdminBySession(hash) : null
  if (!admin) return res.status(401).json({ error: 'Требуется вход' })
  req.admin = admin
  next()
}
