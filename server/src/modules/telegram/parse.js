import { addDays, weekday } from '../../lib/time.js'

const WEEKDAYS = [
  ['пн', 'понедельник'],
  ['вт', 'вторник'],
  ['ср', 'среду', 'среда'],
  ['чт', 'четверг'],
  ['пт', 'пятницу', 'пятница'],
  ['сб', 'субботу', 'суббота'],
  ['вс', 'воскресенье'],
]

export function parseAmount(s) {
  const m = /^([\d\s ]*\d(?:[.,]\d+)?)\s*(к|k|тыс\.?)?$/i.exec(String(s).trim())
  if (!m) return null
  const n = Number(m[1].replace(/[\s ]/g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  return m[2] ? Math.round(n * 1000 * 100) / 100 : Math.round(n * 100) / 100
}

function money(kind, rest) {
  const m = /^([\d\s .,]+(?:\s*(?:к|k|тыс\.?))?)\s*(?:₽|р\.?|руб\.?|rub)?(?:\s+(.*))?$/i.exec(rest.trim())
  if (!m) return null
  const amount = parseAmount(m[1])
  if (!amount) return null
  const tail = (m[2] || '').trim()
  const [category, ...noteParts] = tail.split(/\s*(?:,|—|–| - )\s*/)
  return { type: kind, amount, category: category || null, note: noteParts.join(', ') || null }
}

export function extractWhen(text, today) {
  let title = ` ${text} `
  let date = null
  let time = null
  const take = (re, fn) => {
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
  if (!time) take(/\s(\d{1,2}):(\d{2})(?=\s)/, (m) => {
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

export function parseMessage(raw, today) {
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

  m = /^(?:задача|сделать|напомни(?:ть)?|todo)\s*[:\-]?\s*(.+)$/i.exec(text)
  const body = m ? m[1] : text
  const when = extractWhen(body, today)
  if (!when.title) return { type: 'error', message: 'Пустая задача' }
  return { type: 'task', title: when.title[0].toUpperCase() + when.title.slice(1), due_date: when.date ?? today, due_time: when.time }
}
