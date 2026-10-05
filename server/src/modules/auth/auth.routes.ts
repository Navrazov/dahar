import { Router } from 'express'
import { verifyAgainstNothing, verifyPassword } from '../../lib/crypto.ts'
import { createLimiter } from '../../lib/rate-limit.ts'
import { badRequest } from '../../lib/errors.ts'
import { findByLogin, findById, setPassword } from '../users/users.repository.ts'
import { requireUser } from './auth.middleware.ts'
import * as twoFactor from './two-factor.ts'
import { userSessions } from './user-sessions.ts'

/** Попытки с одного адреса на один логин. */
const byClient = createLimiter({ max: 5, windowMs: 10 * 60 * 1000 })
/** Попытки на логин со всех адресов: перебор через много IP упирается сюда. */
const byLogin = createLimiter({ max: 20, windowMs: 60 * 60 * 1000 })

export const MIN_PASSWORD = 8

const tooMany = (wait: number) => ({ error: `Слишком много попыток. Попробуйте через ${wait} мин.` })

export function authRoutes() {
  const r = Router()

  r.post('/login', async (req, res) => {
    const login = String(req.body?.login || '')
      .trim()
      .toLowerCase()
      .slice(0, 64)
    const password = String(req.body?.password || '').slice(0, 256)
    const clientKey = `${req.ip}:${login}`
    const wait = byClient.blockedFor(clientKey) || byLogin.blockedFor(login)
    if (wait) return res.status(429).json(tooMany(wait))

    const user = await findByLogin(login)
    const ok = user ? await verifyPassword(password, user.password_hash) : await verifyAgainstNothing(password)
    if (!user || !ok) {
      byClient.hit(clientKey)
      byLogin.hit(login)
      return res.status(401).json({ error: 'Неверный логин или пароль' })
    }
    if (user.blocked_at) return res.status(403).json({ error: 'Аккаунт заблокирован' })

    if (user.totp_secret) return res.json({ twoFactor: true, ticket: await twoFactor.startChallenge('user', user.id) })

    byClient.reset(clientKey)
    await userSessions.start(req, res, user.id)
    res.json({ user: { id: user.id, login: user.login, name: user.name } })
  })

  r.post('/login/2fa', async (req, res) => {
    const { ticket, code } = req.body || {}
    const challenge = await twoFactor.readChallenge(['user'], ticket)
    if (!challenge) return res.status(401).json({ error: 'Время на ввод кода истекло. Войдите заново' })
    const user = await findById(challenge.ownerId)
    if (!user || user.blocked_at) return res.status(401).json({ error: 'Войдите заново' })
    const ok = (await twoFactor.checkCode('users', user.id, code)) || (await twoFactor.useRecoveryCode(user.id, code))
    if (!ok) return res.status(401).json({ error: 'Неверный код' })

    await twoFactor.endChallenge(ticket)
    byClient.reset(`${req.ip}:${user.login}`)
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
    if (String(next).length > 256) throw badRequest('Пароль слишком длинный')
    const user = await findById(req.user.id)
    if (!user || !(await verifyPassword(String(current || ''), user.password_hash))) throw badRequest('Текущий пароль неверен')
    await setPassword(req.user.id, String(next), { keepSession: userSessions.tokenHash(req) })
    res.json({ ok: true })
  })

  r.get('/2fa', requireUser, async (req, res) => {
    const enabled = await twoFactor.isEnabled('users', req.user.id)
    res.json({ enabled, recoveryLeft: enabled ? await twoFactor.recoveryLeft(req.user.id) : 0 })
  })

  r.post('/2fa/setup', requireUser, async (req, res) => {
    if (await twoFactor.isEnabled('users', req.user.id)) throw badRequest('Двухфакторная защита уже включена')
    res.json(await twoFactor.beginSetup('users', req.user.id, req.user.login))
  })

  r.post('/2fa/enable', requireUser, async (req, res) => {
    if (!(await twoFactor.confirmSetup('users', req.user.id, req.body?.code)))
      throw badRequest('Код не подошёл. Проверьте время на телефоне и попробуйте ещё раз')
    res.json({ recoveryCodes: await twoFactor.issueRecoveryCodes(req.user.id) })
  })

  /** Отключение и новые коды восстановления требуют пароль и действующий код — украденной сессии мало. */
  async function confirmIdentity(userId: number, password: unknown, code: unknown) {
    const user = await findById(userId)
    if (!user || !(await verifyPassword(String(password || ''), user.password_hash))) throw badRequest('Неверный пароль')
    const ok = (await twoFactor.checkCode('users', userId, code)) || (await twoFactor.useRecoveryCode(userId, code))
    if (!ok) throw badRequest('Неверный код')
  }

  r.post('/2fa/disable', requireUser, async (req, res) => {
    await confirmIdentity(req.user.id, req.body?.password, req.body?.code)
    await twoFactor.disable('users', req.user.id)
    res.json({ ok: true })
  })

  r.post('/2fa/recovery', requireUser, async (req, res) => {
    await confirmIdentity(req.user.id, req.body?.password, req.body?.code)
    res.json({ recoveryCodes: await twoFactor.issueRecoveryCodes(req.user.id) })
  })

  return r
}
