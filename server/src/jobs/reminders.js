import { query } from '../db/pool.js'
import { esc } from '../lib/html.js'
import { nowIn } from '../lib/time.js'
import { telegramOut } from '../modules/telegram/transport.js'
import { linkedUsers } from './linked-users.js'

export async function sendReminders(out = telegramOut, at = new Date()) {
  let sent = 0
  for (const u of await linkedUsers()) {
    if (u.reminders === false) continue
    const now = nowIn(u.tz, at)
    const { rows } = await query(
      `UPDATE tasks SET reminded_at = $3
       WHERE user_id = $1 AND status IS DISTINCT FROM 'done' AND due_date = $2
         AND due_time IS NOT NULL AND due_time <= $4 AND reminded_at IS NULL
       RETURNING id, title, due_time`,
      [u.id, now.date, now.stamp, now.time],
    )
    for (const t of rows) {
      await out
        .send(u.chat, `<b>${esc(t.title)}</b> · ${t.due_time}`, [[{ text: '✓ Готово', callback_data: `done:${t.id}` }]])
        .catch((e) => console.error('Reminder failed:', e.message))
      sent++
    }
  }
  return sent
}
