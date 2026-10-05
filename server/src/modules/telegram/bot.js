import { query } from '../../db/pool.js'
import { esc } from '../../lib/html.js'
import { budgetStatus } from '../finance/finance.service.js'
import { habitLogStatus, setHabitLog } from '../habits/habits.repository.js'
import { getRow } from '../records/records.repository.js'
import { createRecord, updateRecord } from '../records/records.service.js'
import { getSetting, userNow } from '../settings/settings.repository.js'
import { fmtDay, fmtMoney } from './format.js'
import { linkChat, userByChat } from './linking.js'
import { parseMessage } from './parse.js'
import { setBotUsername, telegramOut, tg } from './transport.js'
import { HELP, TODAY_TITLE, habitsView, todayView, weekView } from './views.js'

async function canonicalCategory(userId, kind, category) {
  if (!category) return null
  const { rows } = await query(
    `SELECT category FROM transactions WHERE user_id = $1 AND kind = $2 AND lower(category) = lower($3)
     UNION SELECT category FROM budgets WHERE user_id = $1 AND lower(category) = lower($3) LIMIT 1`,
    [userId, kind, category],
  )
  return rows[0]?.category ?? category[0].toUpperCase() + category.slice(1)
}

async function defaultAccount(userId) {
  const preferred = await getSetting(userId, 'default_account_id')
  if (preferred && (await getRow('accounts', preferred, userId))) return preferred
  const { rows } = await query(
    `SELECT id FROM accounts WHERE user_id = $1 AND archived IS NOT TRUE
     ORDER BY CASE kind WHEN 'card' THEN 0 WHEN 'cash' THEN 1 ELSE 2 END, id LIMIT 1`,
    [userId],
  )
  return rows[0]?.id ?? null
}

function budgetWarning(b, cur) {
  if (!b) return ''
  if (b.spent > b.limit) return `\nБюджет «${esc(b.category)}» превышен: ${fmtMoney(b.spent, cur)} из ${fmtMoney(b.limit, cur)}`
  if (b.spent >= b.limit * 0.8) return `\nБюджет «${esc(b.category)}»: потрачено ${Math.round((b.spent / b.limit) * 100)}%`
  return ''
}

async function addTask(user, cmd, date, chatId, out) {
  const task = await createRecord('tasks', { title: cmd.title, due_date: cmd.due_date, due_time: cmd.due_time, status: 'todo', priority: 'medium' }, user.id)
  const when = cmd.due_date === date ? 'на сегодня' : `на ${fmtDay(cmd.due_date)}`
  return out.send(chatId, `Задача ${when}${cmd.due_time ? ` в ${cmd.due_time}` : ''}:\n<b>${esc(task.title)}</b>`, [[{ text: '✓ Уже сделано', callback_data: `done:${task.id}` }]])
}

async function addMoney(user, cmd, date, chatId, out) {
  const cur = (await getSetting(user.id, 'currency')) || '₽'
  const category = await canonicalCategory(user.id, cmd.type, cmd.category)
  const account = await defaultAccount(user.id)
  await createRecord('transactions', { kind: cmd.type, amount: cmd.amount, category, note: cmd.note, date, account_id: account }, user.id)
  let msg = `${cmd.type === 'expense' ? 'Расход' : 'Доход'} <b>${fmtMoney(cmd.amount, cur)}</b>${category ? ` · ${esc(category)}` : ''}${cmd.note ? ` · ${esc(cmd.note)}` : ''}`
  if (!account) msg += '\n<i>Счёт не выбран — создайте счёт в разделе «Финансы».</i>'
  if (cmd.type === 'expense') msg += budgetWarning(await budgetStatus(user.id, category, date.slice(0, 7)), cur)
  return out.send(chatId, msg)
}

async function handleText(user, text, chatId, out) {
  const { date } = await userNow(user.id)
  const cmd = parseMessage(text, date)
  switch (cmd.type) {
    case 'help':
      return out.send(chatId, HELP)
    case 'error':
      return out.send(chatId, esc(cmd.message))
    case 'today': {
      const v = await todayView(user.id)
      return out.send(chatId, v.text, v.buttons)
    }
    case 'habits': {
      const v = await habitsView(user.id)
      return out.send(chatId, v.text, v.buttons)
    }
    case 'week':
      return out.send(chatId, (await weekView(user.id)).text)
    case 'task':
      return addTask(user, cmd, date, chatId, out)
    case 'expense':
    case 'income':
      return addMoney(user, cmd, date, chatId, out)
  }
}

async function completeTask(user, cb, id, out) {
  const chatId = cb.message.chat.id
  const task = await getRow('tasks', id, user.id)
  if (!task) return out.answer(cb.id, 'Задача не найдена')
  if (task.status !== 'done') await updateRecord('tasks', id, { status: 'done' }, user.id)
  await out.answer(cb.id, `Готово: ${task.title}`)
  if (cb.message.text?.startsWith(TODAY_TITLE)) {
    const v = await todayView(user.id)
    return out.edit(chatId, cb.message.message_id, v.text, v.buttons)
  }
  return out.edit(chatId, cb.message.message_id, `<s>${esc(task.title)}</s>`)
}

async function toggleHabit(user, cb, id, out) {
  const habit = await getRow('habits', id, user.id)
  if (!habit) return out.answer(cb.id, 'Привычка не найдена')
  const { date } = await userNow(user.id)
  const current = await habitLogStatus(id, date)
  const target = habit.kind === 'quit' ? 'slip' : 'done'
  await setHabitLog(user.id, id, date, current ? null : target)
  await out.answer(cb.id, current ? 'Отметка снята' : habit.kind === 'quit' ? 'Отмечен срыв' : 'Отмечено')
  const v = await habitsView(user.id)
  return out.edit(cb.message.chat.id, cb.message.message_id, v.text, v.buttons)
}

async function handleCallback(user, cb, out) {
  const [kind, idStr] = String(cb.data || '').split(':')
  const id = Number(idStr)
  if (kind === 'done') return completeTask(user, cb, id, out)
  if (kind === 'habit') return toggleHabit(user, cb, id, out)
  return out.answer(cb.id)
}

export async function handleUpdate(update, out = telegramOut) {
  if (update.callback_query) {
    const cb = update.callback_query
    const user = await userByChat(cb.message?.chat?.id)
    if (!user) return out.answer(cb.id, 'Сначала привяжите аккаунт в настройках Оси')
    return handleCallback(user, cb, out)
  }
  const msg = update.message
  if (!msg?.text || msg.chat?.type !== 'private') return
  const chatId = msg.chat.id
  const start = /^\/start\s+(\S+)/.exec(msg.text)
  if (start) {
    const userId = await linkChat(start[1], chatId)
    if (!userId) return out.send(chatId, 'Код не подошёл или устарел. Получите новый в «Настройки → Telegram».')
    return out.send(chatId, `Аккаунт привязан.\n\n${HELP}`)
  }
  const user = await userByChat(chatId)
  if (!user) return out.send(chatId, 'Привет! Чтобы пользоваться ботом, откройте Dahar → «Настройки → Telegram» и нажмите «Привязать».')
  return handleText(user, msg.text, chatId, out)
}

const COMMANDS = [
  { command: 'today', description: 'Задачи на сегодня' },
  { command: 'habits', description: 'Отметить привычки' },
  { command: 'week', description: 'Итоги недели' },
  { command: 'help', description: 'Что умеет бот' },
]

export async function startBot({ token }) {
  if (!token) return
  try {
    const me = await tg('getMe', {})
    setBotUsername(me.username)
    await tg('setMyCommands', { commands: COMMANDS })
    console.log(`Telegram bot @${me.username} started`)
  } catch (e) {
    console.error('Telegram bot failed to start:', e.message)
    return
  }
  let offset = 0
  for (;;) {
    try {
      const updates = await tg('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] })
      for (const u of updates) {
        offset = u.update_id + 1
        await handleUpdate(u).catch((e) => console.error('Telegram update failed:', e))
      }
    } catch (e) {
      console.error('Telegram polling error:', e.message)
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
}
