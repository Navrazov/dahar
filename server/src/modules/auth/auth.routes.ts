import { Router } from 'express'
import { verifyAgainstNothing, verifyPassword } from '../../lib/crypto.ts'
import { consumeLimit, createSharedLimiter } from '../../lib/rate-limit.ts'
import { badRequest, HttpError } from '../../lib/errors.ts'
import { createUser, deleteUser, LOGIN_PATTERN, normalizeLogin, findByLogin, findById, setPassword } from '../users/users.repository.ts'
import { query } from '../../db/pool.ts'
import { config } from '../../config.ts'
import { requireUser } from './auth.middleware.ts'
import * as twoFactor from './two-factor.ts'
import { userSessions } from './user-sessions.ts'

const byClient = createSharedLimiter({ scope: 'login-client-failed', max: 5, windowMs: 10 * 60 * 1000 })
const byLogin = createSharedLimiter({ scope: 'login-account-failed', max: 20, windowMs: 60 * 60 * 1000 })

export const MIN_PASSWORD = 8

const tooMany = (wait: number) => ({ error: `Слишком много попыток. Попробуйте через ${wait} мин.` })

export function authRoutes() {
  const r = Router()

  r.get('/config', (_req, res) => res.json({ registration: config.registrationEnabled, terms_url: config.termsUrl, privacy_url: config.privacyUrl }))
  r.post('/register', async (req, res) => {
    if (!config.registrationEnabled) throw new HttpError(403, 'Регистрация пока доступна по приглашению')
    const wait = await consumeLimit('registration', req.ip || '', 5, 60 * 60 * 1000)
    if (wait) return res.status(429).json(tooMany(wait))
    const login = normalizeLogin(req.body?.login)
    const password = req.body?.password
    if (!LOGIN_PATTERN.test(login)) throw badRequest('Логин: 2–32 латинских символа, цифры, точка, дефис или подчёркивание')
    if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > 256) throw badRequest('Пароль: от 8 до 256 символов')
    if (req.body?.accepted_terms !== true) throw badRequest('Подтвердите согласие с условиями и политикой конфиденциальности')
    let user
    try {
      user = await createUser({
        login,
        password,
        name: String(req.body?.name || login)
          .trim()
          .slice(0, 100),
      })
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new HttpError(409, 'Этот логин уже занят')
      throw e
    }
    await userSessions.start(req, res, user.id)
    res.status(201).json({ user: { ...user, dataset_version: 1 } })
  })
  r.get('/sessions', requireUser, async (req, res) => {
    const rows = (
      await query('SELECT token_hash,created_at,expires_at,ip,user_agent FROM sessions WHERE user_id=$1 AND expires_at>now() ORDER BY created_at DESC', [
        req.user.id,
      ])
    ).rows
    const current = userSessions.tokenHash(req)
    res.json(
      rows.map((row) => ({
        id: row.token_hash,
        current: row.token_hash === current,
        created_at: row.created_at,
        expires_at: row.expires_at,
        ip: row.ip,
        user_agent: row.user_agent,
      })),
    )
  })
  r.delete('/sessions/:id', requireUser, async (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(String(req.params.id))) throw badRequest('Неверная сессия')
    await query('DELETE FROM sessions WHERE user_id=$1 AND token_hash=$2', [req.user.id, req.params.id])
    res.json({ ok: true })
  })
  r.post('/sessions/revoke-others', requireUser, async (req, res) => {
    await query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2', [req.user.id, userSessions.tokenHash(req)])
    res.json({ ok: true })
  })
  r.delete('/account', requireUser, async (req, res) => {
    const user = await findById(req.user.id)
    if (req.body?.confirm !== 'delete' || !user || !(await verifyPassword(String(req.body?.password || ''), user.password_hash)))
      throw badRequest('Для удаления подтвердите действие и введите пароль')
    if (user.totp_secret && !(await twoFactor.checkCode('users', user.id, req.body?.code)) && !(await twoFactor.useRecoveryCode(user.id, req.body?.code)))
      throw badRequest('Введите код двухфакторной защиты')
    await deleteUser(user.id)
    await userSessions.end(req, res)
    res.json({ ok: true })
  })

  r.post('/login', async (req, res) => {
    const login = String(req.body?.login || '')
      .trim()
      .toLowerCase()
      .slice(0, 64)
    const password = String(req.body?.password || '').slice(0, 256)
    const clientKey = `${req.ip}:${login}`
    const wait =
      (await byClient.blockedFor(clientKey)) || (await byLogin.blockedFor(login)) || (await consumeLimit('login-requests', String(req.ip), 100, 10 * 60 * 1000))
    if (wait) return res.status(429).json(tooMany(wait))

    const user = await findByLogin(login)
    const ok = user ? await verifyPassword(password, user.password_hash) : await verifyAgainstNothing(password)
    if (!user || !ok) {
      await byClient.hit(clientKey)
      await byLogin.hit(login)
      return res.status(401).json({ error: 'Неверный логин или пароль' })
    }
    if (user.blocked_at) return res.status(403).json({ error: 'Аккаунт заблокирован' })

    if (user.totp_secret) return res.json({ twoFactor: true, ticket: await twoFactor.startChallenge('user', user.id) })

    await byClient.reset(`${req.ip}:${user.login}`)
    await userSessions.start(req, res, user.id)
    res.json({ user: { id: user.id, login: user.login, name: user.name, dataset_version: user.dataset_version } })
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
    await byClient.reset(`${req.ip}:${user.login}`)
    await userSessions.start(req, res, user.id)
    res.json({ user: { id: user.id, login: user.login, name: user.name, dataset_version: user.dataset_version } })
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
