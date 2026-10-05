import { nowIn } from '../lib/time.js'
import { putSetting } from '../modules/settings/settings.repository.js'
import { telegramOut } from '../modules/telegram/transport.js'
import { digestText } from '../modules/telegram/views.js'
import { linkedUsers } from './linked-users.js'

const DEFAULT_HOUR = 8
const WINDOW_HOURS = 3

export async function sendDigests(out = telegramOut, at = new Date()) {
  let sent = 0
  for (const u of await linkedUsers()) {
    const hour = u.digest_hour === null ? DEFAULT_HOUR : u.digest_hour
    if (hour === false || hour === -1) continue
    const now = nowIn(u.tz, at)
    if (now.hour < hour || now.hour >= hour + WINDOW_HOURS || u.last_digest === now.date) continue
    await putSetting(u.id, 'last_digest', now.date)
    await out.send(u.chat, await digestText(u.id)).catch((e) => console.error('Digest failed:', e.message))
    sent++
  }
  return sent
}
