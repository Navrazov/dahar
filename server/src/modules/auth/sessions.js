import { query, q } from '../../db/pool.js'
import { parseCookies, serializeCookie } from '../../lib/cookies.js'
import { randomToken, sha256 } from '../../lib/crypto.js'

export function createSessionStore({ table, owner, cookie, path = '/', days = 30 }) {
  const maxAge = days * 86400

  const tokenOf = (req) => parseCookies(req.headers.cookie)[cookie]

  return {
    cookie,

    async start(req, res, ownerId) {
      const token = randomToken()
      await query(
        `INSERT INTO ${q(table)} (token_hash, ${q(owner)}, ip, user_agent, expires_at)
         VALUES ($1, $2, $3, $4, now() + make_interval(days => $5))`,
        [sha256(token), ownerId, req.ip ?? null, String(req.headers['user-agent'] ?? '').slice(0, 300) || null, days],
      )
      res.append('Set-Cookie', serializeCookie(cookie, token, { maxAge, path }))
    },

    async end(req, res) {
      const token = tokenOf(req)
      if (token) await query(`DELETE FROM ${q(table)} WHERE token_hash = $1`, [sha256(token)])
      res.append('Set-Cookie', serializeCookie(cookie, '', { maxAge: 0, path }))
    },

    tokenHash(req) {
      const token = tokenOf(req)
      return token ? sha256(token) : null
    },

    async endAllFor(ownerId) {
      const { rowCount } = await query(`DELETE FROM ${q(table)} WHERE ${q(owner)} = $1`, [ownerId])
      return rowCount
    },

    async cleanup() {
      await query(`DELETE FROM ${q(table)} WHERE expires_at < now()`)
    },
  }
}
