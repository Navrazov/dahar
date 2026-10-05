import webpush from 'web-push'
import { config } from '../../config.ts'
import { query } from '../../db/pool.ts'

/**
 * Push-уведомления в браузер (Web Push). Ключи VAPID берутся из окружения, а если их нет —
 * создаются при первом запуске и хранятся в базе, чтобы подписки переживали перезапуски.
 */

interface Vapid {
  publicKey: string
  privateKey: string
}

let vapid: Vapid | null = null

export async function initPush() {
  if (config.vapid.publicKey && config.vapid.privateKey) {
    vapid = { publicKey: config.vapid.publicKey, privateKey: config.vapid.privateKey }
  } else {
    const { rows } = await query<{ value: Vapid }>(`SELECT value FROM app_config WHERE key = 'vapid'`)
    vapid = rows[0]?.value ?? null
    if (!vapid) {
      vapid = webpush.generateVAPIDKeys()
      await query(`INSERT INTO app_config (key, value) VALUES ('vapid', $1) ON CONFLICT (key) DO NOTHING`, [JSON.stringify(vapid)])
      const again = await query<{ value: Vapid }>(`SELECT value FROM app_config WHERE key = 'vapid'`)
      vapid = again.rows[0].value
    }
  }
  webpush.setVapidDetails(config.vapid.subject, vapid.publicKey, vapid.privateKey)
}

export const pushPublicKey = () => vapid?.publicKey ?? null

export interface SubscriptionInput {
  endpoint?: unknown
  keys?: { p256dh?: unknown; auth?: unknown }
}

export const isValidSubscription = (s: SubscriptionInput | undefined): s is { endpoint: string; keys: { p256dh: string; auth: string } } =>
  !!s &&
  typeof s.endpoint === 'string' &&
  /^https:\/\/\S+$/.test(s.endpoint) &&
  s.endpoint.length <= 1000 &&
  typeof s.keys?.p256dh === 'string' &&
  s.keys.p256dh.length <= 200 &&
  typeof s.keys?.auth === 'string' &&
  s.keys.auth.length <= 100

export async function saveSubscription(userId: number, s: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent: string | null) {
  // Один и тот же браузер мог раньше принадлежать другому пользователю — подписка переходит к текущему.
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
    [userId, s.endpoint, s.keys.p256dh, s.keys.auth, userAgent?.slice(0, 300) ?? null],
  )
}

export async function removeSubscription(userId: number, endpoint: string) {
  await query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [userId, endpoint])
}

export async function subscriptionCount(userId: number) {
  const { rows } = await query<{ n: number }>('SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = $1', [userId])
  return rows[0].n
}

export interface PushMessage {
  title: string
  body: string
  /** Куда открыть приложение по нажатию. */
  url?: string
  /** Уведомления с одним тегом заменяют друг друга. */
  tag?: string
  /** Задача, которую можно отметить кнопкой «Готово». */
  taskId?: number
}

export interface PushSender {
  sendToUser(userId: number, message: PushMessage): Promise<number>
}

/** Отправляет на все устройства пользователя. Просроченные подписки (404/410) удаляет. */
export const pushSender: PushSender = {
  async sendToUser(userId, message) {
    if (!vapid) return 0
    const { rows } = await query<{ id: number; endpoint: string; p256dh: string; auth: string }>(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
      [userId],
    )
    let delivered = 0
    for (const s of rows) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(message), {
          TTL: 3600,
          urgency: 'normal',
        })
        await query('UPDATE push_subscriptions SET last_used_at = now() WHERE id = $1', [s.id])
        delivered++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) await query('DELETE FROM push_subscriptions WHERE id = $1', [s.id])
        else console.error('Push failed:', (e as Error).message)
      }
    }
    return delivered
  },
}
