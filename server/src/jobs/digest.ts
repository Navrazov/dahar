import { nowIn } from '../lib/time.ts'
import { pushSender, type PushSender } from '../modules/push/push.service.ts'
import { putSetting } from '../modules/settings/settings.repository.ts'
import { telegramOut, type TelegramOut } from '../modules/telegram/transport.ts'
import { digestSummary, digestText } from '../modules/telegram/views.ts'
import { notifiableUsers } from './linked-users.ts'
import { deliver } from './delivery.ts'

export async function sendDigests(out: TelegramOut = telegramOut, at = new Date(), push: PushSender = pushSender) {
  let sent = 0
  for (const u of await notifiableUsers()) {
    const hour = u.digest_hour ?? 8
    if (hour === false || hour === -1) continue
    const now = nowIn(u.tz, at)
    if (now.hour < hour || now.hour >= hour + 3 || u.last_digest === now.date) continue
    const key = `digest:${now.date}`
    const receipts: boolean[] = []
    if (u.chat)
      receipts.push(
        await deliver(u.id, key, 'telegram', at, async () => {
          await out.send(u.chat!, await digestText(u.id))
          return true
        }),
      )
    if (u.push)
      receipts.push(
        await deliver(u.id, key, 'push', at, async () => (await push.sendToUser(u.id, { ...(await digestSummary(u.id)), url: '/', tag: 'digest' })) > 0),
      )
    if (receipts.length && receipts.every(Boolean)) {
      await putSetting(u.id, 'last_digest', now.date)
      sent++
    }
  }
  return sent
}
