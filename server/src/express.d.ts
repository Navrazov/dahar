import 'express'

export interface SessionUser {
  id: number
  login: string
  name: string | null
}

export interface SessionAdmin {
  id: number
  login: string
  last_login_at: string | Date | null
}

declare global {
  namespace Express {
    interface Request {
      /** Есть на всех роутах после requireUser; до него может отсутствовать. */
      user: SessionUser
      /** Есть на всех роутах после requireAdmin. */
      admin: SessionAdmin
    }
  }
}
