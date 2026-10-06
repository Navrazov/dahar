import { query } from '../db/pool.ts'
import { esc } from '../lib/html.ts'
import { nowIn } from '../lib/time.ts'
import { pushSender, type PushSender } from '../modules/push/push.service.ts'
import { telegramOut, type TelegramOut } from '../modules/telegram/transport.ts'
import { notifiableUsers } from './linked-users.ts'
import { deliver } from './delivery.ts'

export async function sendReminders(out: TelegramOut = telegramOut, at = new Date(), push: PushSender = pushSender) {
  let sent = 0
  for (const u of await notifiableUsers()) {
    if (u.reminders === false) continue
    const now = nowIn(u.tz, at)
    const { rows } = await query<{ id: number; title: string; due_time: string }>(
      `SELECT id,title,due_time FROM tasks WHERE user_id=$1
      AND status IS DISTINCT FROM 'done' AND due_date=$2 AND due_time IS NOT NULL AND due_time<=$3 AND reminded_at IS NULL`,
      [u.id, now.date, now.time],
    )
    for (const t of rows) {
      const key = `task:${t.id}:${now.date}:${t.due_time}`
      const receipts: boolean[] = []
      if (u.chat)
        receipts.push(
          await deliver(u.id, key, 'telegram', at, async (c) => {
            if (
              !(
                await query(
                  "SELECT 1 FROM tasks WHERE id=$1 AND user_id=$2 AND status IS DISTINCT FROM 'done' AND due_date=$3 AND due_time=$4 AND reminded_at IS NULL",
                  [t.id, u.id, now.date, t.due_time],
                  c,
                )
              ).rowCount
            )
              return false
            await out.send(u.chat!, `<b>${esc(t.title)}</b> · ${t.due_time}`, [[{ text: '✓ Готово', callback_data: `done:${t.id}` }]])
            return true
          }),
        )
      if (u.push)
        receipts.push(
          await deliver(u.id, key, 'push', at, async (c) => {
            if (
              !(
                await query(
                  "SELECT 1 FROM tasks WHERE id=$1 AND user_id=$2 AND status IS DISTINCT FROM 'done' AND due_date=$3 AND due_time=$4 AND reminded_at IS NULL",
                  [t.id, u.id, now.date, t.due_time],
                  c,
                )
              ).rowCount
            )
              return false
            return (
              (await push.sendToUser(u.id, { title: t.title, body: `Напоминание · ${t.due_time}`, url: '/tasks', tag: `task-${t.id}`, taskId: t.id }, key)) > 0
            )
          }),
        )
      if (receipts.length && receipts.every(Boolean)) {
        const result = await query(`UPDATE tasks SET reminded_at=$3 WHERE id=$1 AND user_id=$2 AND reminded_at IS NULL AND due_date=$4 AND due_time=$5`, [
          t.id,
          u.id,
          now.stamp,
          now.date,
          t.due_time,
        ])
        if (result.rowCount) sent++
      }
    }
  }
  return sent
}
