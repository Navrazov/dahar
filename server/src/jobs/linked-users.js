import { query } from '../db/pool.js'

export async function linkedUsers() {
  const { rows } = await query(`
    SELECT u.id, u.telegram_chat_id AS chat,
      (SELECT value FROM settings WHERE user_id = u.id AND key = 'timezone') AS tz,
      (SELECT value FROM settings WHERE user_id = u.id AND key = 'reminders_enabled') AS reminders,
      (SELECT value FROM settings WHERE user_id = u.id AND key = 'digest_hour') AS digest_hour,
      (SELECT value FROM settings WHERE user_id = u.id AND key = 'last_digest') AS last_digest
    FROM users u WHERE u.telegram_chat_id IS NOT NULL AND u.blocked_at IS NULL`)
  return rows
}
