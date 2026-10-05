import type { Request, Response } from 'express'
import { query, q } from '../../db/pool.ts'
import { parseCookies, serializeCookie } from '../../lib/cookies.ts'
import { randomToken, sha256 } from '../../lib/crypto.ts'

interface StoreOptions {
  table: string
  owner: string
  cookie: string
  path?: string
  days?: number
  /** Принимать токен и из заголовка Authorization: Bearer. */
  bearer?: boolean
}

export function createSessionStore({ table, owner, cookie, path = '/', days = 30, bearer: allowBearer = false }: StoreOptions) {
  const maxAge = days * 86400

  // Мини-приложение Telegram живёт во фрейме, где cookie не доходят, — оно шлёт токен заголовком.
  const bearer = (req: Request) => /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1]
  // Явно переданный токен важнее cookie: браузер мог подставить устаревшую сессию сам.
  const tokenOf = (req: Request): string | undefined => (allowBearer ? bearer(req) : undefined) ?? parseCookies(req.headers.cookie)[cookie]

  async function insert(req: Request, ownerId: number) {
    const token = randomToken()
    await query(
      `INSERT INTO ${q(table)} (token_hash, ${q(owner)}, ip, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(days => $5))`,
      [sha256(token), ownerId, req.ip ?? null, String(req.headers['user-agent'] ?? '').slice(0, 300) || null, days],
    )
    return token
  }

  return {
    cookie,

    async start(req: Request, res: Response, ownerId: number) {
      const token = await insert(req, ownerId)
      res.append('Set-Cookie', serializeCookie(cookie, token, { maxAge, path }))
    },

    /** Сессия без cookie: токен отдаётся клиенту и приходит обратно в Authorization. */
    issue: insert,

    async end(req: Request, res: Response) {
      const token = tokenOf(req)
      if (token) await query(`DELETE FROM ${q(table)} WHERE token_hash = $1`, [sha256(token)])
      res.append('Set-Cookie', serializeCookie(cookie, '', { maxAge: 0, path }))
    },

    tokenHash(req: Request) {
      const token = tokenOf(req)
      return token ? sha256(token) : null
    },

    async endAllFor(ownerId: number) {
      const { rowCount } = await query(`DELETE FROM ${q(table)} WHERE ${q(owner)} = $1`, [ownerId])
      return rowCount ?? 0
    },

    async cleanup() {
      await query(`DELETE FROM ${q(table)} WHERE expires_at < now()`)
    },
  }
}
