import { query } from '../db/pool.ts'

export interface NotifiableUser {
  id: number
  /** Чат Telegram, если бот привязан. */
  chat: number | null
  /** Есть ли подписки на push в браузере. */
  push: boolean
  tz: string | null
  reminders: boolean | null
  digest_hour: number | false | null
  last_digest: string | null
}

/** Пользователи, до которых можно достучаться: через Telegram или push. */
export async function notifiableUsers(): Promise<NotifiableUser[]> {
  const { rows } = await query<NotifiableUser>(`
    SELECT u.id, u.telegram_chat_id AS chat,
      EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id) AS push,
      (SELECT value FROM settings WHERE user_id = u.id AND key = 'timezone') AS tz,
      (SELECT value FROM settings WHERE user_id = u.id AND key = 'reminders_enabled') AS reminders,
      (SELECT value FROM settings WHERE user_id = u.id AND key = 'digest_hour') AS digest_hour,
      (SELECT value FROM settings WHERE user_id = u.id AND key = 'last_digest') AS last_digest
    FROM users u
    WHERE u.blocked_at IS NULL
      AND (u.telegram_chat_id IS NOT NULL OR EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id))`)
  return rows
}
