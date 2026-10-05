import { query, type DbRow } from '../../db/pool.ts'
import { esc } from '../../lib/html.ts'
import { addDays, weekday } from '../../lib/time.ts'
import { getSetting, userNow } from '../settings/settings.repository.ts'
import { fmtDay, fmtMoney } from './format.ts'
import type { Buttons } from './transport.ts'

export interface View {
  text: string
  buttons?: Buttons
}

export const HELP = [
  '<b>Что я умею</b>',
  '',
  '<b>Задача</b> — просто напишите текст:',
  '• <i>купить молоко</i>',
  '• <i>позвонить Ирине завтра в 15:00</i>',
  '• <i>отчёт в пятницу</i>, <i>оплатить интернет 05.11</i>',
  '',
  '<b>Деньги</b> — категория и сумма:',
  '• <i>кофе 400</i>, <i>такси до дома 350</i>, <i>-1200 продукты, ашан</i>',
  '• <i>зарплата 120к</i>  или  <i>+5000</i>',
  'Ошибся с типом — нажмите кнопку под ответом: «Это доход», «Это задача», «Удалить».',
  '',
  '<b>Голосом</b>: просто отправьте голосовое — расшифрую и запишу.',
  '',
  '<b>Списки</b>: <i>сегодня</i> · <i>привычки</i> · <i>неделя</i>',
  '',
  '<b>Выписка</b>: перешлите файл CSV или PDF из приложения банка — операции попадут в «Финансы».',
].join('\n')

export const TODAY_TITLE = 'Задачи на сегодня'

export async function todayView(userId: number): Promise<View> {
  const { date } = await userNow(userId)
  const { rows } = await query(
    `SELECT id, title, due_date, due_time FROM tasks
     WHERE user_id = $1 AND status IS DISTINCT FROM 'done' AND due_date <= $2
     ORDER BY due_date, due_time NULLS LAST, id LIMIT 30`,
    [userId, date],
  )
  if (!rows.length) return { text: 'На сегодня задач нет' }
  const lines = rows.map((t, i) => `${i + 1}. ${esc(t.title)}${t.due_time ? ` · ${t.due_time}` : ''}${t.due_date < date ? ' · <i>просрочено</i>' : ''}`)
  const buttons = rows.slice(0, 12).map((t, i) => [{ text: `✓ ${i + 1}. ${t.title.slice(0, 40)}`, callback_data: `done:${t.id}` }])
  return { text: `<b>${TODAY_TITLE}</b>\n\n${lines.join('\n')}\n\nНажмите, чтобы отметить выполненной:`, buttons }
}

export async function habitsView(userId: number): Promise<View> {
  const { date, weekday: wd } = await userNow(userId)
  const { rows } = await query(
    `SELECT h.id, h.name, h.kind, h.frequency, h.days, l.status
     FROM habits h LEFT JOIN habit_logs l ON l.habit_id = h.id AND l.date = $2
     WHERE h.user_id = $1 AND h.archived IS NOT TRUE ORDER BY h.id`,
    [userId, date],
  )
  const due = rows.filter((h) => h.kind === 'quit' || h.frequency !== 'weekdays' || (h.days || []).includes(wd))
  if (!due.length) return { text: 'На сегодня привычек нет' }
  const quit = (h: DbRow) => h.kind === 'quit'
  const mark = (h: DbRow) => (h.status === 'slip' ? '✗' : h.status === 'done' ? '✓' : '○')
  const suffix = (h: DbRow) => (quit(h) ? (h.status === 'slip' ? ' — срыв' : h.status === 'done' ? ' — держусь' : ' — нет отметки') : '')
  const buttons = due.map((h) => [{ text: `${mark(h)} ${h.name}${suffix(h)}`, callback_data: `habit:${h.id}` }])
  const done = due.filter((h) => h.status === 'done').length
  return { text: `<b>Привычки на сегодня</b> · ${done}/${due.length}\n\nНажмите, чтобы отметить (для «избавиться»: держусь → срыв → снять):`, buttons }
}

export async function weekView(userId: number): Promise<View> {
  const { date } = await userNow(userId)
  const start = addDays(date, -(weekday(date) - 1))
  const cur = (await getSetting(userId, 'currency')) || '₽'
  const [tasks, money, habits] = await Promise.all([
    query(
      `SELECT count(*) FILTER (WHERE status = 'done' AND completed_at >= $2) AS done,
              count(*) FILTER (WHERE status IS DISTINCT FROM 'done' AND due_date < $3) AS overdue
       FROM tasks WHERE user_id = $1`,
      [userId, start, date],
    ),
    query(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE kind = 'income'), 0) AS income,
              COALESCE(SUM(amount) FILTER (WHERE kind = 'expense'), 0) AS expense
       FROM transactions WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
      [userId, start, date],
    ),
    query(`SELECT count(*) AS logs FROM habit_logs WHERE user_id = $1 AND status = 'done' AND date BETWEEN $2 AND $3`, [userId, start, date]),
  ])
  const t = tasks.rows[0]
  const m = money.rows[0]
  return {
    text: [
      `<b>Неделя с ${fmtDay(start)}</b>`,
      '',
      `Задач выполнено: <b>${t.done}</b>${Number(t.overdue) ? ` · просрочено: ${t.overdue}` : ''}`,
      `Отметок привычек: <b>${habits.rows[0].logs}</b>`,
      `Доход: <b>${fmtMoney(m.income, cur)}</b> · расход: <b>${fmtMoney(m.expense, cur)}</b>`,
    ].join('\n'),
  }
}

export async function digestText(userId: number) {
  const { date } = await userNow(userId)
  const [tasks, events, partners, user] = await Promise.all([
    query(
      `SELECT title, due_time, due_date FROM tasks
       WHERE user_id = $1 AND status IS DISTINCT FROM 'done' AND due_date <= $2
       ORDER BY due_date, due_time NULLS LAST LIMIT 15`,
      [userId, date],
    ),
    query(
      `SELECT title, start, all_day FROM events
       WHERE user_id = $1 AND start::date <= $2::date AND COALESCE("end", start)::date >= $2::date ORDER BY start`,
      [userId, date],
    ),
    query(
      `SELECT name, next_action FROM partners
       WHERE user_id = $1 AND next_action IS NOT NULL AND next_action_date <= $2 ORDER BY next_action_date LIMIT 10`,
      [userId, date],
    ),
    query('SELECT name FROM users WHERE id = $1', [userId]),
  ])
  const name = (await getSetting(userId, 'user_name')) || user.rows[0]?.name
  const lines: string[] = [`<b>Доброе утро${name ? `, ${esc(name)}` : ''}!</b> ${fmtDay(date)}`, '']
  const block = (title: string, rows: DbRow[], line: (r: DbRow) => string) => {
    if (!rows.length) return
    lines.push(`<b>${title}</b>`, ...rows.map(line), '')
  }
  block(
    `Задачи (${tasks.rows.length})`,
    tasks.rows,
    (t) => `• ${esc(t.title)}${t.due_time ? ` · ${t.due_time}` : ''}${t.due_date < date ? ' · <i>просрочено</i>' : ''}`,
  )
  block('События', events.rows, (e) => `• ${esc(e.title)}${e.all_day ? '' : ` · ${e.start.slice(11, 16)}`}`)
  block('Партнёры', partners.rows, (p) => `• ${esc(p.name)}: ${esc(p.next_action)}`)
  if (lines.length === 2) lines.push('Сегодня ничего не запланировано — хороший день, чтобы спланировать неделю.')
  lines.push('Напишите <i>сегодня</i> — отметить задачи, <i>привычки</i> — отметить привычки.')
  return lines.join('\n')
}

/** Короткая сводка для push-уведомления: без разметки, в одну-две строки. */
export async function digestSummary(userId: number) {
  const { date } = await userNow(userId)
  const { rows } = await query<{ tasks: number; overdue: number; events: number }>(
    `SELECT
       (SELECT count(*)::int FROM tasks WHERE user_id = $1 AND status IS DISTINCT FROM 'done' AND due_date = $2::date) AS tasks,
       (SELECT count(*)::int FROM tasks WHERE user_id = $1 AND status IS DISTINCT FROM 'done' AND due_date < $2::date) AS overdue,
       (SELECT count(*)::int FROM events WHERE user_id = $1 AND start::date <= $2::date AND COALESCE("end", start)::date >= $2::date) AS events`,
    [userId, date],
  )
  const { tasks, overdue, events } = rows[0]
  const parts = [tasks ? `задач на сегодня: ${tasks}` : 'задач на сегодня нет', overdue ? `просрочено: ${overdue}` : '', events ? `событий: ${events}` : '']
  const body = parts.filter(Boolean).join(' · ')
  return { title: 'Доброе утро! План на день', body: body[0].toUpperCase() + body.slice(1) }
}
