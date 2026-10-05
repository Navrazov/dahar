import { Router } from 'express'
import { hashPassword, verifyAgainstNothing, verifyPassword } from '../../lib/crypto.ts'
import { badRequest, notFound } from '../../lib/errors.ts'
import { createLimiter } from '../../lib/rate-limit.ts'
import { MIN_PASSWORD } from '../auth/auth.routes.ts'
import * as twoFactor from '../auth/two-factor.ts'
import { userSessions } from '../auth/user-sessions.ts'
import { createUser, deleteUser, findById, findByLogin, LOGIN_PATTERN, normalizeLogin } from '../users/users.repository.ts'
import { query, tx } from '../../db/pool.ts'
import { requireAdmin } from './admin.middleware.ts'
import { audit, findAdminById, findAdminByLogin, listAudit, markAdminLogin, setAdminPassword } from './admin.repository.ts'
import { adminSessions } from './admin.sessions.ts'
import { clearErrors, listErrors, listUsers, overview, retention, systemInfo, userDetail } from './admin.stats.ts'
import { auditPage, operations, usersPage } from './admin.reporting.ts'

const byIp = createLimiter({ max: 5, windowMs: 15 * 60 * 1000 })
const byLogin = createLimiter({ max: 10, windowMs: 60 * 60 * 1000 })

const validPassword = (p: unknown): p is string => typeof p === 'string' && p.length >= MIN_PASSWORD

async function userOr404(id: unknown) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) throw notFound('Пользователь не найден')
  const user = await findById(Number(id))
  if (!user) throw notFound('Пользователь не найден')
  return user
}

function authRoutes() {
  const r = Router()

  r.post('/login', async (req, res) => {
    const ip = String(req.ip)
    const login = String(req.body?.login || '')
      .trim()
      .toLowerCase()
      .slice(0, 64)
    const password = String(req.body?.password || '').slice(0, 256)
    const wait = byIp.blockedFor(ip) || byLogin.blockedFor(login)
    if (wait) return res.status(429).json({ error: `Слишком много попыток. Попробуйте через ${wait} мин.` })
    const admin = await findAdminByLogin(login)
    const ok = admin ? await verifyPassword(password, admin.password_hash) : await verifyAgainstNothing(password)
    if (!admin || !ok) {
      byIp.hit(ip)
      byLogin.hit(login)
      return res.status(401).json({ error: 'Неверный логин или пароль' })
    }
    byIp.reset(ip)
    // Вход в админку только со вторым фактором. Если приложение ещё не привязано — привязываем прямо сейчас.
    if (admin.totp_secret) return res.json({ twoFactor: true, ticket: await twoFactor.startChallenge('admin', admin.id) })
    const setup = await twoFactor.beginSetup('admins', admin.id, `admin:${admin.login}`)
    res.json({ setupRequired: true, ticket: await twoFactor.startChallenge('admin_setup', admin.id), ...setup })
  })

  r.post('/login/2fa', async (req, res) => {
    const { ticket, code } = req.body || {}
    const challenge = await twoFactor.readChallenge(['admin', 'admin_setup'], ticket)
    if (!challenge) return res.status(401).json({ error: 'Время на ввод кода истекло. Войдите заново' })
    const ok =
      challenge.kind === 'admin_setup'
        ? await twoFactor.confirmSetup('admins', challenge.ownerId, code)
        : await twoFactor.checkCode('admins', challenge.ownerId, code)
    if (!ok) return res.status(401).json({ error: 'Неверный код' })
    const admin = await findAdminById(challenge.ownerId)
    if (!admin) return res.status(401).json({ error: 'Войдите заново' })

    await twoFactor.endChallenge(ticket)
    await adminSessions.start(req, res, admin.id)
    await markAdminLogin(admin.id)
    req.admin = { id: admin.id, login: admin.login, last_login_at: admin.last_login_at }
    if (challenge.kind === 'admin_setup') await audit(req, 'admin_2fa_enabled')
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
    if (!admin || !(await verifyPassword(String(current || ''), admin.password_hash))) throw badRequest('Текущий пароль неверен')
    await setAdminPassword(admin.id, next)
    await audit(req, 'admin_password')
    res.json({ ok: true })
  })

  return r
}

function usersRoutes() {
  const r = Router()

  r.get('/', async (req, res) => res.json(req.query.paged === '1' ? await usersPage(req.query) : await listUsers()))

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
    await userOr404(req.params.id)
    const detail = await userDetail(Number(req.params.id))
    if (!detail) throw notFound('Пользователь не найден')
    res.json(detail)
  })

  r.patch('/:id', async (req, res) => {
    const user = await userOr404(req.params.id)
    const { name, password, blocked } = req.body || {}
    if (name !== undefined && (typeof name !== 'string' || name.length > 100)) throw badRequest('Имя — строка до 100 символов')
    if (password !== undefined && (!validPassword(password) || password.length > 256)) throw badRequest(`Пароль — от ${MIN_PASSWORD} до 256 символов`)
    if (blocked !== undefined && typeof blocked !== 'boolean') throw badRequest('Статус блокировки должен быть true или false')
    const passwordHash = password !== undefined ? await hashPassword(password) : null
    await tx(async (c) => {
      if (!(await query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id], c)).rows.length) throw notFound('Пользователь не найден')
      if (name !== undefined) {
        await query('UPDATE users SET name = $1 WHERE id = $2', [name.trim() || user.login, user.id], c)
        await audit(req, 'user_rename', user.login, { name }, c)
      }
      if (password !== undefined) {
        await query('UPDATE users SET password_hash=$1 WHERE id=$2', [passwordHash, user.id], c)
        await query('DELETE FROM sessions WHERE user_id=$1', [user.id], c)
        await audit(req, 'user_password', user.login, null, c)
      }
      if (blocked !== undefined) {
        await query('UPDATE users SET blocked_at = $1 WHERE id = $2', [blocked ? new Date() : null, user.id], c)
        if (blocked) await query('DELETE FROM sessions WHERE user_id=$1', [user.id], c)
        await audit(req, blocked ? 'user_block' : 'user_unblock', user.login, null, c)
      }
    })
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
  r.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  r.use('/auth', authRoutes())
  r.use(requireAdmin)

  r.get('/overview', async (_req, res) => res.json(await overview()))
  r.use('/users', usersRoutes())
  r.get('/retention', async (_req, res) => res.json(await retention()))
  r.get('/system', async (_req, res) => res.json(await systemInfo()))
  r.get('/operations', async (_req, res) => res.json(await operations()))
  r.get('/errors', async (req, res) => res.json(await listErrors(req.query)))
  r.delete('/errors', async (req, res) => {
    const removed = await clearErrors()
    await audit(req, 'errors_clear', null, { removed })
    res.json({ removed })
  })
  r.get('/audit', async (req, res) => res.json(req.query.paged === '1' ? await auditPage(req.query) : await listAudit()))

  r.use((_req, res) => res.status(404).json({ error: 'Не найдено' }))

  return r
}
