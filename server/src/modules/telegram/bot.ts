import { query, type DbRow } from '../../db/pool.ts'
import { esc } from '../../lib/html.ts'
import { budgetStatus } from '../finance/finance.service.ts'
import { habitLogStatus, setHabitLog } from '../habits/habits.repository.ts'
import { getRow } from '../records/records.repository.ts'
import { createRecord, deleteRecord, updateRecord } from '../records/records.service.ts'
import { getSetting, userNow } from '../settings/settings.repository.ts'
import { fmtDay, fmtMoney } from './format.ts'
import { linkChat, userByChat, type TgUser } from './linking.ts'
import { parseAmount, parseMessage, type Command } from './parse.ts'
import { MAX_VOICE_SEC, sttEnabled, transcribe } from './stt.ts'
import { downloadFile, miniAppUrl, setBotUsername, telegramOut, tg, type Buttons, type TelegramOut } from './transport.ts'
import { importStatement, MAX_STATEMENT_BYTES } from '../finance/import/import.service.ts'
import { HttpError } from '../../lib/errors.ts'
import { HELP, TODAY_TITLE, habitsView, todayView, weekView } from './views.ts'

export interface TgChat {
  id: number
  type?: string
}

export interface TgDocument {
  file_id: string
  file_name?: string
  mime_type?: string
  file_size?: number
}

export interface TgAudio {
  file_id: string
  duration?: number
  file_size?: number
  mime_type?: string
}

export interface TgMessage {
  message_id?: number
  chat: TgChat
  text?: string
  caption?: string
  document?: TgDocument
  voice?: TgAudio
  audio?: TgAudio
  video_note?: TgAudio
}

export interface TgCallback {
  id: string
  data?: string
  message?: TgMessage & { message_id: number }
}

export interface TgUpdate {
  update_id?: number
  message?: TgMessage
  callback_query?: TgCallback
}

type TaskCmd = Extract<Command, { type: 'task' }>
type MoneyCmd = Extract<Command, { type: 'expense' | 'income' }>
type Cb = TgCallback & { message: NonNullable<TgCallback['message']> }

async function canonicalCategory(userId: number, kind: string, category: string | null) {
  if (!category) return null
  const { rows } = await query(
    `SELECT category FROM transactions WHERE user_id = $1 AND kind = $2 AND lower(category) = lower($3)
     UNION SELECT category FROM budgets WHERE user_id = $1 AND lower(category) = lower($3) LIMIT 1`,
    [userId, kind, category],
  )
  return rows[0]?.category ?? category[0].toUpperCase() + category.slice(1)
}

export async function defaultAccount(userId: number): Promise<number | null> {
  const preferred = await getSetting(userId, 'default_account_id')
  if (preferred && (await getRow('accounts', preferred, userId))) return preferred
  const { rows } = await query(
    `SELECT id FROM accounts WHERE user_id = $1 AND archived IS NOT TRUE
     ORDER BY CASE kind WHEN 'card' THEN 0 WHEN 'cash' THEN 1 ELSE 2 END, id LIMIT 1`,
    [userId],
  )
  return rows[0]?.id ?? null
}

function budgetWarning(b: { category: string; limit: number; spent: number } | null, cur: string) {
  if (!b) return ''
  if (b.spent > b.limit) return `\nБюджет «${esc(b.category)}» превышен: ${fmtMoney(b.spent, cur)} из ${fmtMoney(b.limit, cur)}`
  if (b.spent >= b.limit * 0.8) return `\nБюджет «${esc(b.category)}»: потрачено ${Math.round((b.spent / b.limit) * 100)}%`
  return ''
}

/** Исходный текст записи — чтобы «Это задача» превратило трату обратно в ту же фразу. Живёт до перезапуска. */
const sourceText = new Map<string, string>()
function remember(key: string, text: string) {
  sourceText.set(key, text)
  if (sourceText.size > 500) sourceText.delete(sourceText.keys().next().value!)
}

function taskMessage(task: DbRow, date: string) {
  const when = task.due_date === date ? 'на сегодня' : `на ${fmtDay(task.due_date)}`
  const text = `Задача ${when}${task.due_time ? ` в ${task.due_time}` : ''}:\n<b>${esc(task.title)}</b>`
  const buttons: Buttons = [
    [
      { text: '✓ Сделано', callback_data: `done:${task.id}` },
      { text: '✕ Удалить', callback_data: `del:task:${task.id}` },
    ],
  ]
  if (findAmount(task.title)) buttons.push([{ text: '₽ Это трата', callback_data: `tomoney:${task.id}` }])
  return { text, buttons }
}

async function moneyMessage(userId: number, tx: DbRow, accountMissing: boolean) {
  const cur = (await getSetting(userId, 'currency')) || '₽'
  const expense = tx.kind === 'expense'
  let text = `${expense ? 'Расход' : 'Доход'} <b>${fmtMoney(Number(tx.amount), cur)}</b>${tx.category ? ` · ${esc(tx.category)}` : ''}${tx.note ? ` · ${esc(tx.note)}` : ''}`
  if (accountMissing) text += '\n<i>Счёт не выбран — создайте счёт в разделе «Финансы».</i>'
  if (expense) text += budgetWarning(await budgetStatus(userId, tx.category, String(tx.date).slice(0, 7)), cur)
  const buttons: Buttons = [
    [
      { text: expense ? '⇄ Это доход' : '⇄ Это расход', callback_data: `kind:${tx.id}` },
      { text: '✕ Удалить', callback_data: `del:tx:${tx.id}` },
    ],
    [{ text: '☐ Это задача', callback_data: `totask:${tx.id}` }],
  ]
  return { text, buttons }
}

/** Первое число в тексте задачи, похожее на сумму: «такси 500» → 500. */
function findAmount(text: string) {
  const m = /(\d[\d\s\u00a0]*(?:[.,]\d+)?\s*(?:к|k|тыс\.?)?)(?=\s|$|₽|р)/i.exec(String(text))
  return m ? parseAmount(m[1].trim()) : null
}

async function addTask(user: TgUser, cmd: TaskCmd, date: string, chatId: number, out: TelegramOut) {
  const task = await createRecord('tasks', { title: cmd.title, due_date: cmd.due_date, due_time: cmd.due_time, status: 'todo', priority: 'medium' }, user.id)
  const v = taskMessage(task, date)
  return out.send(chatId, v.text, v.buttons)
}

async function addMoney(user: TgUser, cmd: MoneyCmd, date: string, chatId: number, out: TelegramOut, source: string) {
  const category = await canonicalCategory(user.id, cmd.type, cmd.category)
  const account = await defaultAccount(user.id)
  const tx = await createRecord('transactions', { kind: cmd.type, amount: cmd.amount, category, note: cmd.note, date, account_id: account }, user.id)
  remember(`tx:${tx.id}`, source)
  const v = await moneyMessage(user.id, tx, !account)
  return out.send(chatId, v.text, v.buttons)
}

async function handleText(user: TgUser, text: string, chatId: number, out: TelegramOut) {
  const { date } = await userNow(user.id)
  const cmd = parseMessage(text, date)
  switch (cmd.type) {
    case 'help':
      return out.send(chatId, HELP, appButton())
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
      return addMoney(user, cmd, date, chatId, out, text)
  }
}

async function completeTask(user: TgUser, cb: Cb, id: number, out: TelegramOut) {
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

async function toggleHabit(user: TgUser, cb: Cb, id: number, out: TelegramOut) {
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

async function removeRecord(user: TgUser, cb: Cb, table: 'tasks' | 'transactions', id: number, out: TelegramOut) {
  const row = await getRow(table, id, user.id)
  if (row) await deleteRecord(table, id, user.id)
  await out.answer(cb.id, 'Удалено')
  const what = table === 'tasks' ? esc(row?.title ?? 'Задача') : 'Запись'
  return out.edit(cb.message.chat.id, cb.message.message_id, `<s>${what}</s> — удалено`)
}

async function flipKind(user: TgUser, cb: Cb, id: number, out: TelegramOut) {
  const tx = await getRow('transactions', id, user.id)
  if (!tx || tx.kind === 'transfer') return out.answer(cb.id, 'Запись не найдена')
  const kind = tx.kind === 'expense' ? 'income' : 'expense'
  const category = await canonicalCategory(user.id, kind, tx.category)
  const updated = await updateRecord('transactions', id, { kind, category }, user.id)
  await out.answer(cb.id, kind === 'income' ? 'Теперь это доход' : 'Теперь это расход')
  const v = await moneyMessage(user.id, updated, !updated.account_id)
  return out.edit(cb.message.chat.id, cb.message.message_id, v.text, v.buttons)
}

async function moneyToTask(user: TgUser, cb: Cb, id: number, out: TelegramOut) {
  const tx = await getRow('transactions', id, user.id)
  if (!tx) return out.answer(cb.id, 'Запись не найдена')
  const { date } = await userNow(user.id)
  const fallback = [tx.category, tx.note, Number(tx.amount)].filter(Boolean).join(' ')
  const raw = sourceText.get(`tx:${id}`) ?? fallback
  const title = raw[0].toUpperCase() + raw.slice(1)
  await deleteRecord('transactions', id, user.id)
  const task = await createRecord('tasks', { title, due_date: date, status: 'todo', priority: 'medium' }, user.id)
  await out.answer(cb.id, 'Теперь это задача')
  const v = taskMessage(task, date)
  return out.edit(cb.message.chat.id, cb.message.message_id, v.text, v.buttons)
}

async function taskToMoney(user: TgUser, cb: Cb, id: number, out: TelegramOut) {
  const task = await getRow('tasks', id, user.id)
  const amount = task && findAmount(task.title)
  if (!task || !amount) return out.answer(cb.id, 'Не нашёл сумму в задаче')
  const { date } = await userNow(user.id)
  const words = String(task.title)
    .replace(/(\d[\d\s\u00a0]*(?:[.,]\d+)?\s*(?:к|k|тыс\.?)?)\s*(?:₽|р\.?|руб\.?)?/i, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const [category, ...note] = words.split(' ')
  await deleteRecord('tasks', id, user.id)
  const account = await defaultAccount(user.id)
  const tx = await createRecord(
    'transactions',
    { kind: 'expense', amount, category: await canonicalCategory(user.id, 'expense', category || null), note: note.join(' ') || null, date, account_id: account },
    user.id,
  )
  remember(`tx:${tx.id}`, task.title)
  await out.answer(cb.id, 'Теперь это расход')
  const v = await moneyMessage(user.id, tx, !account)
  return out.edit(cb.message.chat.id, cb.message.message_id, v.text, v.buttons)
}

async function handleCallback(user: TgUser, cb: Cb, out: TelegramOut) {
  const parts = String(cb.data || '').split(':')
  const kind = parts[0]
  const id = Number(parts.at(-1))
  if (kind === 'done') return completeTask(user, cb, id, out)
  if (kind === 'habit') return toggleHabit(user, cb, id, out)
  if (kind === 'del' && (parts[1] === 'task' || parts[1] === 'tx')) return removeRecord(user, cb, parts[1] === 'task' ? 'tasks' : 'transactions', id, out)
  if (kind === 'kind') return flipKind(user, cb, id, out)
  if (kind === 'totask') return moneyToTask(user, cb, id, out)
  if (kind === 'tomoney') return taskToMoney(user, cb, id, out)
  return out.answer(cb.id)
}

export interface BotDeps {
  download: (fileId: string) => Promise<Buffer>
  transcribe?: (audio: Buffer) => Promise<string>
}

const bankTitle = { tbank: 'Т-Банк', sber: 'Сбер', csv: 'CSV' } as const

/** Выписку можно просто переслать боту: она разберётся и сохранится без дублей. */
async function handleDocument(user: TgUser, msg: TgMessage & { document: TgDocument }, chatId: number, out: TelegramOut, deps: BotDeps) {
  const doc = msg.document
  if (!/\.(csv|pdf)$/i.test(doc.file_name ?? '') && !/csv|pdf|text\/plain/.test(doc.mime_type ?? '')) {
    return out.send(chatId, 'Пришлите выписку файлом CSV или PDF — разберу операции и добавлю в «Финансы».')
  }
  if ((doc.file_size ?? 0) > MAX_STATEMENT_BYTES) return out.send(chatId, 'Файл больше 10 МБ — выгрузите выписку за более короткий период.')
  await out.send(chatId, 'Читаю выписку…')
  try {
    const buf = await deps.download(doc.file_id)
    const r = await importStatement(user.id, buf, { hint: msg.caption ?? null, defaultAccountId: await defaultAccount(user.id) })
    const lines = [
      `<b>${bankTitle[r.bank]} → «${esc(r.account.name)}»</b>`,
      `Добавлено операций: <b>${r.created}</b>`,
      r.transfers ? `Переводов между своими счетами: ${r.transfers}` : '',
      r.skipped ? `Уже были в базе, пропущено: ${r.skipped}` : '',
      '',
      '<i>Категории можно поправить в «Финансах». Не тот счёт? Пришлите файл ещё раз с названием счёта в подписи.</i>',
    ]
    return out.send(chatId, lines.filter((l, i) => l || i === 4).join('\n'))
  } catch (e) {
    if (e instanceof HttpError) return out.send(chatId, esc(e.message))
    throw e
  }
}

/** Голосовое → текст → как будто его написали. */
async function handleVoice(user: TgUser, audio: TgAudio, chatId: number, out: TelegramOut, deps: BotDeps) {
  if (!sttEnabled()) {
    return out.send(chatId, 'Голосовые пока не настроены: на сервере нужен ключ <code>STT_API_KEY</code> (Groq или OpenAI). Пока напишите текстом.')
  }
  if ((audio.duration ?? 0) > MAX_VOICE_SEC) return out.send(chatId, 'Слишком длинное голосовое — запишите до 5 минут.')
  let text: string
  try {
    text = await (deps.transcribe ?? transcribe)(await deps.download(audio.file_id))
  } catch (e) {
    console.error('Voice transcription failed:', (e as Error).message)
    return out.send(chatId, 'Не получилось расшифровать голосовое. Попробуйте ещё раз или напишите текстом.')
  }
  if (!text) return out.send(chatId, 'Ничего не расслышал — попробуйте ещё раз.')
  // «Кофе 400.» — точка в конце мешает разбору
  const clean = text.replace(/[.!?…]+$/, '').trim()
  await out.send(chatId, `🎙 <i>${esc(clean)}</i>`)
  return handleText(user, clean, chatId, out)
}

export async function handleUpdate(update: TgUpdate, out: TelegramOut = telegramOut, deps: BotDeps = { download: downloadFile }) {
  if (update.callback_query) {
    const cb = update.callback_query
    const user = await userByChat(cb.message?.chat?.id)
    if (!user || !cb.message) return out.answer(cb.id, 'Сначала привяжите аккаунт в настройках Dahar')
    return handleCallback(user, cb as Cb, out)
  }
  const msg = update.message
  const audio = msg?.voice ?? msg?.audio ?? msg?.video_note
  if (!msg || msg.chat?.type !== 'private' || (!msg.text && !msg.document && !audio)) return
  const chatId = msg.chat.id
  const start = /^\/start\s+(\S+)/.exec(msg.text ?? '')
  if (start) {
    const userId = await linkChat(start[1], chatId)
    if (!userId) return out.send(chatId, 'Код не подошёл или устарел. Получите новый в «Настройки → Telegram».')
    return out.send(chatId, `Аккаунт привязан.\n\n${HELP}`, appButton())
  }
  const user = await userByChat(chatId)
  if (!user) return out.send(chatId, 'Привет! Чтобы пользоваться ботом, откройте Dahar → «Настройки → Telegram» и нажмите «Привязать».')
  if (audio) return handleVoice(user, audio, chatId, out, deps)
  if (msg.document) return handleDocument(user, { ...msg, document: msg.document }, chatId, out, deps)
  return handleText(user, msg.text ?? '', chatId, out)
}

const appButton = (): Buttons | undefined => {
  const url = miniAppUrl()
  return url ? [[{ text: 'Открыть Dahar', web_app: { url } }]] : undefined
}

const COMMANDS = [
  { command: 'today', description: 'Задачи на сегодня' },
  { command: 'habits', description: 'Отметить привычки' },
  { command: 'week', description: 'Итоги недели' },
  { command: 'help', description: 'Что умеет бот' },
]

/** Long polling до остановки через signal. */
export async function startBot({ token, signal }: { token: string | null; signal?: AbortSignal }) {
  if (!token || signal?.aborted) return
  try {
    const me = await tg<{ username: string }>('getMe', {})
    setBotUsername(me.username)
    await tg('setMyCommands', { commands: COMMANDS })
    const url = miniAppUrl()
    // кнопка слева от поля ввода открывает мини-приложение
    if (url) await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Dahar', web_app: { url } } }).catch((e) => console.error(e.message))
    console.log(`Telegram bot @${me.username} started`)
  } catch (e) {
    console.error('Telegram bot failed to start:', (e as Error).message)
    return
  }
  let offset = 0
  while (!signal?.aborted) {
    try {
      const updates = await tg<(TgUpdate & { update_id: number })[]>('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] })
      for (const u of updates) {
        if (signal?.aborted) break
        offset = u.update_id + 1
        await handleUpdate(u).catch((e) => console.error('Telegram update failed:', e))
      }
    } catch (e) {
      console.error('Telegram polling error:', (e as Error).message)
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
}
