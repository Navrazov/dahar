import { query } from '../../db/pool.ts'
import { randomToken } from '../../lib/crypto.ts'
import { botInfo } from './transport.ts'

export interface TgUser {
  id: number
  name: string | null
  login: string
}

export async function createLinkCode(userId: number) {
  const code = randomToken(6)
  await query('DELETE FROM telegram_codes WHERE user_id = $1 OR expires_at < now()', [userId])
  await query(`INSERT INTO telegram_codes (code, user_id, expires_at) VALUES ($1, $2, now() + interval '15 minutes')`, [code, userId])
  const { username } = botInfo()
  return { code, link: username ? `https://t.me/${username}?start=${code}` : null }
}

export async function linkChat(code: string, chatId: number): Promise<number | null> {
  const { rows } = await query('DELETE FROM telegram_codes WHERE code = $1 AND expires_at > now() RETURNING user_id', [code])
  if (!rows[0]) return null
  await query('UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = $1', [chatId])
  await query('UPDATE users SET telegram_chat_id = $1 WHERE id = $2', [chatId, rows[0].user_id])
  return rows[0].user_id
}

export async function unlinkChat(userId: number) {
  await query('UPDATE users SET telegram_chat_id = NULL WHERE id = $1', [userId])
}

export async function isLinked(userId: number) {
  const { rows } = await query('SELECT telegram_chat_id FROM users WHERE id = $1', [userId])
  return !!rows[0]?.telegram_chat_id
}

export async function userByChat(chatId: number | undefined): Promise<TgUser | undefined> {
  const { rows } = await query<TgUser>('SELECT id, name, login FROM users WHERE telegram_chat_id = $1 AND blocked_at IS NULL', [chatId])
  return rows[0]
}
