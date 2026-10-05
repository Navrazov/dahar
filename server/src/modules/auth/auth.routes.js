import { Router } from 'express'
import { verifyPassword } from '../../lib/crypto.js'
import { createLimiter } from '../../lib/rate-limit.js'
import { badRequest } from '../../lib/errors.js'
import { findByLogin, findById, setPassword } from '../users/users.repository.js'
import { requireUser } from './auth.middleware.js'
import { userSessions } from './user-sessions.js'

const limiter = createLimiter({ max: 5, windowMs: 10 * 60 * 1000 })

export const MIN_PASSWORD = 8

export function authRoutes() {
  const r = Router()

  r.post('/login', async (req, res) => {
    const login = String(req.body?.login || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    const key = `${req.ip}:${login}`
    const wait = limiter.blockedFor(key)
    if (wait) return res.status(429).json({ error: `Слишком много попыток. Попробуйте через ${wait} мин.` })

    const user = await findByLogin(login)
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      limiter.hit(key)
      return res.status(401).json({ error: 'Неверный логин или пароль' })
    }
    if (user.blocked_at) return res.status(403).json({ error: 'Аккаунт заблокирован' })

    limiter.reset(key)
    await userSessions.start(req, res, user.id)
    res.json({ user: { id: user.id, login: user.login, name: user.name } })
  })

  r.post('/logout', async (req, res) => {
    await userSessions.end(req, res)
    res.json({ ok: true })
  })

  r.get('/me', requireUser, (req, res) => res.json({ user: req.user }))

  r.post('/password', requireUser, async (req, res) => {
    const { current, next } = req.body || {}
    if (!next || String(next).length < MIN_PASSWORD) throw badRequest(`Новый пароль — минимум ${MIN_PASSWORD} символов`)
    const user = await findById(req.user.id)
    if (!(await verifyPassword(String(current || ''), user.password_hash))) throw badRequest('Текущий пароль неверен')
    await setPassword(req.user.id, String(next), { keepSession: userSessions.tokenHash(req) })
    res.json({ ok: true })
  })

  return r
}
