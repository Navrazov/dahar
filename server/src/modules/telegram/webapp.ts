import { createHmac, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { config } from '../../config.ts'
import { query } from '../../db/pool.ts'
import { sha256 } from '../../lib/crypto.ts'
import { createLimiter } from '../../lib/rate-limit.ts'
import { userSessions } from '../auth/user-sessions.ts'
import { userByChat } from './linking.ts'

/** initData старше суток не принимаем: так перехваченную строку нельзя использовать вечно. */
const MAX_AGE_SEC = 24 * 3600

/**
 * Проверяет подпись initData мини-приложения и возвращает id пользователя Telegram.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyInitData(initData: string, botToken: string, now = Date.now()): number | null {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null
  params.delete('hash')
  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expected = createHmac('sha256', secret).update(checkString).digest()
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null

  const authDate = Number(params.get('auth_date'))
  if (!authDate || authDate - now / 1000 > 60 || now / 1000 - authDate > MAX_AGE_SEC) return null
  try {
    const id = Number(JSON.parse(params.get('user') ?? 'null')?.id)
    return Number.isSafeInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

const limiter = createLimiter({ max: 30, windowMs: 10 * 60 * 1000 })

/** Вход из мини-приложения. Работает до requireUser: пароль не нужен, достаточно подписи Telegram. */
export function webAppRoutes() {
  const r = Router()

  r.post('/telegram/webapp', async (req, res) => {
    const wait = limiter.blockedFor(String(req.ip))
    if (wait) return res.status(429).json({ error: 'Слишком много попыток' })
    const token = config.telegram.token
    if (!token) return res.status(503).json({ error: 'Бот не настроен на сервере' })

    const tgId = verifyInitData(String(req.body?.initData ?? ''), token)
    if (!tgId) {
      limiter.hit(String(req.ip))
      return res.status(401).json({ error: 'Откройте приложение из Telegram' })
    }
    // Прежний токен этого устройства больше не нужен: на устройстве всегда одна сессия.
    const previous = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1]
    if (previous) await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(previous)])

    // В личном чате id чата совпадает с id пользователя — по нему аккаунт и привязан.
    const user = await userByChat(tgId)
    if (!user) return res.status(403).json({ error: 'not_linked' })

    await query('UPDATE users SET last_miniapp_at=now() WHERE id=$1', [user.id])
    const session = await userSessions.issue(req, user.id)
    res.json({ token: session, user })
  })

  return r
}
