import { addDays, weekday } from '../../lib/time.ts'

const WEEKDAYS = [
  ['пн', 'понедельник'],
  ['вт', 'вторник'],
  ['ср', 'среду', 'среда'],
  ['чт', 'четверг'],
  ['пт', 'пятницу', 'пятница'],
  ['сб', 'субботу', 'суббота'],
  ['вс', 'воскресенье'],
]

export function parseAmount(s: unknown): number | null {
  const m = /^([\d\s ]*\d(?:[.,]\d+)?)\s*(к|k|тыс\.?)?$/i.exec(String(s).trim())
  if (!m) return null
  const n = Number(m[1].replace(/[\s ]/g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  return m[2] ? Math.round(n * 1000 * 100) / 100 : Math.round(n * 100) / 100
}

export type MoneyCommand = { type: 'expense' | 'income'; amount: number; category: string | null; note: string | null }

export type Command =
  | { type: 'help' | 'today' | 'habits' | 'week' }
  | { type: 'error'; message: string }
  | MoneyCommand
  | { type: 'task'; title: string; due_date: string; due_time: string | null }

function money(kind: 'expense' | 'income', rest: string): Command | null {
  const m = /^([\d\s .,]+(?:\s*(?:к|k|тыс\.?))?)\s*(?:₽|р\.?|руб\.?|rub)?(?:\s+(.*))?$/i.exec(rest.trim())
  if (!m) return null
  const amount = parseAmount(m[1])
  if (!amount) return null
  const tail = (m[2] || '').trim()
  const [category, ...noteParts] = tail.split(/\s*(?:,|—|–| - )\s*/)
  return { type: kind, amount, category: category || null, note: noteParts.join(', ') || null }
}

export function extractWhen(text: string, today: string) {
  let title = ` ${text} `
  let date: string | null = null
  let time: string | null = null
  const take = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    const m = re.exec(title)
    if (m) {
      fn(m)
      title = title.replace(m[0], ' ')
    }
  }

  take(/\s(?:в|к)\s+(\d{1,2})(?::(\d{2}))?(?=\s)/i, (m) => {
    const h = Number(m[1])
    const min = Number(m[2] || 0)
    if (h < 24 && min < 60) time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  })
  if (!time)
    take(/\s(\d{1,2}):(\d{2})(?=\s)/, (m) => {
      if (Number(m[1]) < 24 && Number(m[2]) < 60) time = `${m[1].padStart(2, '0')}:${m[2]}`
    })

  take(/\s(послезавтра)(?=\s)/i, () => (date = addDays(today, 2)))
  take(/\s(завтра)(?=\s)/i, () => (date = addDays(today, 1)))
  take(/\s(сегодня)(?=\s)/i, () => (date = today))
  take(/\sчерез\s+(\d+)\s+(?:дн(?:я|ей|ь)|день)(?=\s)/i, (m) => (date = addDays(today, Number(m[1]))))
  take(/\sчерез\s+недел[юи](?=\s)/i, () => (date = addDays(today, 7)))
  take(/\s(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?=\s)/, (m) => {
    const y = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : today.slice(0, 4)
    let d = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    if (Number.isNaN(Date.parse(`${d}T00:00:00Z`))) return
    if (!m[3] && d < today) d = `${Number(y) + 1}${d.slice(4)}`
    date = d
  })
  for (let i = 0; i < 7 && !date; i++) {
    const names = WEEKDAYS[i].join('|')
    take(new RegExp(`\\s(?:в|во)\\s+(?:${names})(?=\\s)`, 'i'), () => {
      const diff = (i + 1 - weekday(today) + 7) % 7 || 7
      date = addDays(today, diff)
    })
  }

  return { title: title.replace(/\s+/g, ' ').trim(), date, time }
}

const AMOUNT = String.raw`(\d[\d\s\u00a0]*(?:[.,]\d+)?\s*(?:к|k|тыс\.?)?)`
const CURRENCY = String.raw`(?:\s*(?:₽|р\.?|руб\.?|рублей|rub))?`
const CURRENCY_ONLY = /(?:₽|р\.?|руб\.?|рублей|rub)\s*$/i
const TAIL_AMOUNT = new RegExp(String.raw`^([^\d]+?)\s+${AMOUNT}(${CURRENCY})(?:\s*,\s*([^\d]+))?$`, 'i')
const HEAD_AMOUNT = new RegExp(String.raw`^${AMOUNT}(${CURRENCY})\s+([^\d]+)$`, 'i')
/** Слова, после которых число — это время или срок, а не сумма: «встреча в 15». */
const TIME_PREPOSITION = /(?:^|\s)(?:в|во|к|до|через|после|около)$/i
/** Глагол в инфинитиве — признак задачи: «прочитать 30 страниц». */
const INFINITIVE = /^[а-яё-]+(?:ть|ться|чь|чься|ти|тись)$/i
const INCOME = /^(?:зарплат|зп$|аванс|преми|кешб[еэ]к|кэшб[еэ]к|возврат|дивиденд|процент|фриланс|гонорар|подарили)/i

/**
 * Сумма без слова «расход»: «кофе 400», «400 кофе», «такси до дома 350р».
 * Если похоже на время или задачу — не трогаем, пусть станет задачей.
 */
function bareMoney(text: string, today: string): MoneyCommand | null {
  // «отчёт 05.11», «такси завтра 500» — это задачи со сроком
  if (extractWhen(text, today).date) return null
  let words: string
  let amountText: string
  let currency: string
  let extra = ''
  let m = TAIL_AMOUNT.exec(text)
  if (m) {
    ;[, words, amountText, currency, extra = ''] = m
    if (TIME_PREPOSITION.test(words.trim())) return null
  } else if ((m = HEAD_AMOUNT.exec(text))) {
    ;[, amountText, currency, words] = m
  } else return null

  const amount = parseAmount(amountText)
  if (!amount) return null
  // «2 молока» — скорее задача, чем трата в два рубля
  if (amount < 10 && !CURRENCY_ONLY.test(currency)) return null
  words = words.trim().replace(/\s+(?:за|на)$/i, '')
  if (extra.trim()) words += `, ${extra.trim()}`
  const tokens = words.split(/\s+/)
  if (tokens.some((w) => INFINITIVE.test(w))) return null

  const kind = INCOME.test(tokens[0]) ? 'income' : 'expense'
  const [head, ...rest] = words.split(/\s*(?:,|—|–| - )\s*/)
  // «такси до дома» → категория «такси», заметка «до дома»
  const [category, ...noteWords] = rest.length ? [head] : head.split(/\s+/)
  const note = [noteWords.join(' '), ...rest].filter(Boolean).join(', ')
  return { type: kind, amount, category, note: note || null }
}

export function parseMessage(raw: unknown, today: string): Command {
  const text = String(raw || '').trim()
  const lower = text.toLowerCase()
  if (!text) return { type: 'help' }

  if (/^\/?(start|help|помощь|команды)$/.test(lower)) return { type: 'help' }
  if (/^\/?(today|сегодня|задачи|дела)$/.test(lower)) return { type: 'today' }
  if (/^\/?(habits|привычки)$/.test(lower)) return { type: 'habits' }
  if (/^\/?(week|неделя|итоги)$/.test(lower)) return { type: 'week' }

  let m = /^(?:расход|потратил[аи]?|трата|-)\s*(.+)$/i.exec(text)
  if (m) return money('expense', m[1]) ?? { type: 'error', message: 'Не понял сумму. Пример: расход 500 кафе' }
  m = /^(?:доход|получил[аи]?|\+)\s*(.+)$/i.exec(text)
  if (m) return money('income', m[1]) ?? { type: 'error', message: 'Не понял сумму. Пример: доход 50000 зарплата' }

  m = /^(?:задача|сделать|напомни(?:ть)?|todo)\s*[:-]?\s*(.+)$/i.exec(text)
  if (!m) {
    const bare = bareMoney(text, today)
    if (bare) return bare
  }
  const body = m ? m[1] : text
  const when = extractWhen(body, today)
  if (!when.title) return { type: 'error', message: 'Пустая задача' }
  return { type: 'task', title: when.title[0].toUpperCase() + when.title.slice(1), due_date: when.date ?? today, due_time: when.time }
}
