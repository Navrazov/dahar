import { Router } from 'express'
import { verifyPassword } from '../../lib/crypto.js'
import { badRequest, notFound } from '../../lib/errors.js'
import { createLimiter } from '../../lib/rate-limit.js'
import { MIN_PASSWORD } from '../auth/auth.routes.js'
import { userSessions } from '../auth/user-sessions.js'
import { createUser, deleteUser, findById, findByLogin, LOGIN_PATTERN, normalizeLogin, setPassword } from '../users/users.repository.js'
import { query } from '../../db/pool.js'
import { requireAdmin } from './admin.middleware.js'
import { audit, findAdminById, findAdminByLogin, listAudit, markAdminLogin, setAdminPassword } from './admin.repository.js'
import { adminSessions } from './admin.sessions.js'
import { clearErrors, listErrors, listUsers, overview, retention, systemInfo, userDetail } from './admin.stats.js'

const limiter = createLimiter({ max: 5, windowMs: 15 * 60 * 1000 })

const validPassword = (p) => typeof p === 'string' && p.length >= MIN_PASSWORD

async function userOr404(id) {
  const user = await findById(Number(id))
  if (!user) throw notFound('Пользователь не найден')
  return user
}

function authRoutes() {
  const r = Router()

  r.post('/login', async (req, res) => {
    const key = req.ip
    const wait = limiter.blockedFor(key)
    if (wait) return res.status(429).json({ error: `Слишком много попыток. Попробуйте через ${wait} мин.` })
    const admin = await findAdminByLogin(req.body?.login)
    if (!admin || !(await verifyPassword(String(req.body?.password || ''), admin.password_hash))) {
      limiter.hit(key)
      return res.status(401).json({ error: 'Неверный логин или пароль' })
    }
    limiter.reset(key)
    await adminSessions.start(req, res, admin.id)
    await markAdminLogin(admin.id)
    req.admin = admin
    await audit(req, 'admin_login')
    res.json({ admin: { id: admin.id, login: admin.login } })
  })

  r.post('/logout', async (req, res) => {
    await adminSessions.end(req, res)
    res.json({ ok: true })
  })

  r.get('/me', requireAdmin, (req, res) => res.json({ admin: req.admin }))

  r.post('/password', requireAdmin, async (req, res) => {
    const { current, next } = req.body || {}
    if (!validPassword(next)) throw badRequest(`Новый пароль — минимум ${MIN_PASSWORD} символов`)
    const admin = await findAdminById(req.admin.id)
    if (!(await verifyPassword(String(current || ''), admin.password_hash))) throw badRequest('Текущий пароль неверен')
    await setAdminPassword(admin.id, next)
    await audit(req, 'admin_password')
    res.json({ ok: true })
  })

  return r
}

function usersRoutes() {
  const r = Router()

  r.get('/', async (_req, res) => res.json(await listUsers()))

  r.post('/', async (req, res) => {
    const login = normalizeLogin(req.body?.login)
    const { password, name } = req.body || {}
    if (!LOGIN_PATTERN.test(login)) throw badRequest('Логин: 2–32 символа, латиница, цифры, точка, дефис, подчёркивание')
    if (!validPassword(password)) throw badRequest(`Пароль — минимум ${MIN_PASSWORD} символов`)
    if (await findByLogin(login)) throw badRequest('Такой логин уже занят')
    const user = await createUser({ login, password, name: String(name || '').trim() || login })
    await audit(req, 'user_create', user.login)
    res.status(201).json(user)
  })

  r.get('/:id', async (req, res) => {
    const detail = await userDetail(Number(req.params.id))
    if (!detail) throw notFound('Пользователь не найден')
    res.json(detail)
  })

  r.patch('/:id', async (req, res) => {
    const user = await userOr404(req.params.id)
    const { name, password, blocked } = req.body || {}
    if (name !== undefined) {
      await query('UPDATE users SET name = $1 WHERE id = $2', [String(name).trim() || user.login, user.id])
      await audit(req, 'user_rename', user.login, { name })
    }
    if (password !== undefined) {
      if (!validPassword(password)) throw badRequest(`Пароль — минимум ${MIN_PASSWORD} символов`)
      await setPassword(user.id, password)
      await audit(req, 'user_password', user.login)
    }
    if (blocked !== undefined) {
      await query('UPDATE users SET blocked_at = $1 WHERE id = $2', [blocked ? new Date() : null, user.id])
      if (blocked) await userSessions.endAllFor(user.id)
      await audit(req, blocked ? 'user_block' : 'user_unblock', user.login)
    }
    res.json(await userDetail(user.id))
  })

  r.delete('/:id/sessions', async (req, res) => {
    const user = await userOr404(req.params.id)
    const ended = await userSessions.endAllFor(user.id)
    await audit(req, 'user_sessions_end', user.login, { ended })
    res.json({ ended })
  })

  r.delete('/:id', async (req, res) => {
    const user = await userOr404(req.params.id)
    if (normalizeLogin(req.body?.confirm) !== user.login) throw badRequest('Для удаления введите логин пользователя')
    await deleteUser(user.id)
    await audit(req, 'user_delete', user.login)
    res.json({ ok: true })
  })

  return r
}

export function adminRoutes() {
  const r = Router()

  r.use('/auth', authRoutes())
  r.use(requireAdmin)

  r.get('/overview', async (_req, res) => res.json(await overview()))
  r.use('/users', usersRoutes())
  r.get('/retention', async (_req, res) => res.json(await retention()))
  r.get('/system', async (_req, res) => res.json(await systemInfo()))
  r.get('/errors', async (req, res) => res.json(await listErrors(req.query)))
  r.delete('/errors', async (req, res) => {
    const removed = await clearErrors()
    await audit(req, 'errors_clear', null, { removed })
    res.json({ removed })
  })
  r.get('/audit', async (_req, res) => res.json(await listAudit()))

  r.use((_req, res) => res.status(404).json({ error: 'Не найдено' }))

  return r
}
