import { nowIn } from '../lib/time.ts'
import { pushSender, type PushSender } from '../modules/push/push.service.ts'
import { putSetting } from '../modules/settings/settings.repository.ts'
import { telegramOut, type TelegramOut } from '../modules/telegram/transport.ts'
import { digestSummary, digestText } from '../modules/telegram/views.ts'
import { notifiableUsers } from './linked-users.ts'

const DEFAULT_HOUR = 8
const WINDOW_HOURS = 3

export async function sendDigests(out: TelegramOut = telegramOut, at = new Date(), push: PushSender = pushSender) {
  let sent = 0
  for (const u of await notifiableUsers()) {
    const hour = u.digest_hour === null ? DEFAULT_HOUR : u.digest_hour
    if (hour === false || hour === -1) continue
    const now = nowIn(u.tz, at)
    if (now.hour < hour || now.hour >= hour + WINDOW_HOURS || u.last_digest === now.date) continue
    await putSetting(u.id, 'last_digest', now.date)
    if (u.chat) await out.send(u.chat, await digestText(u.id)).catch((e) => console.error('Digest failed:', (e as Error).message))
    if (u.push) await push.sendToUser(u.id, { ...(await digestSummary(u.id)), url: '/', tag: 'digest' })
    sent++
  }
  return sent
}
