import { query } from '../db/pool.ts'
import { esc } from '../lib/html.ts'
import { nowIn } from '../lib/time.ts'
import { pushSender, type PushSender } from '../modules/push/push.service.ts'
import { telegramOut, type TelegramOut } from '../modules/telegram/transport.ts'
import { notifiableUsers } from './linked-users.ts'

/** Напоминает о задачах, у которых наступило время. Каждая задача — один раз, во все каналы пользователя. */
export async function sendReminders(out: TelegramOut = telegramOut, at = new Date(), push: PushSender = pushSender) {
  let sent = 0
  for (const u of await notifiableUsers()) {
    if (u.reminders === false) continue
    const now = nowIn(u.tz, at)
    const { rows } = await query<{ id: number; title: string; due_time: string }>(
      `UPDATE tasks SET reminded_at = $3
       WHERE user_id = $1 AND status IS DISTINCT FROM 'done' AND due_date = $2
         AND due_time IS NOT NULL AND due_time <= $4 AND reminded_at IS NULL
       RETURNING id, title, due_time`,
      [u.id, now.date, now.stamp, now.time],
    )
    for (const t of rows) {
      if (u.chat) {
        await out
          .send(u.chat, `<b>${esc(t.title)}</b> · ${t.due_time}`, [[{ text: '✓ Готово', callback_data: `done:${t.id}` }]])
          .catch((e) => console.error('Reminder failed:', (e as Error).message))
      }
      if (u.push) await push.sendToUser(u.id, { title: t.title, body: `Напоминание · ${t.due_time}`, url: '/tasks', tag: `task-${t.id}`, taskId: t.id })
      sent++
    }
  }
  return sent
}
