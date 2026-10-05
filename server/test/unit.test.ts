import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { parseMessage, parseAmount } from '../src/modules/telegram/parse.ts'
import { verifyInitData } from '../src/modules/telegram/webapp.ts'
import { nextDueDate } from '../src/lib/recurrence.ts'
import { addMonths, nowIn, weekday } from '../src/lib/time.ts'

const today = '2026-10-03'

const dueOf = (text: string) => {
  const cmd = parseMessage(text, today)
  return cmd.type === 'task' ? cmd.due_date : null
}

test('amounts', () => {
  assert.equal(parseAmount('500'), 500)
  assert.equal(parseAmount('1 200,50'), 1200.5)
  assert.equal(parseAmount('120к'), 120000)
  assert.equal(parseAmount('1.5к'), 1500)
  assert.equal(parseAmount('abc'), null)
  assert.equal(parseAmount('0'), null)
})

test('money messages', () => {
  assert.deepEqual(parseMessage('расход 500 кафе', today), { type: 'expense', amount: 500, category: 'кафе', note: null })
  assert.deepEqual(parseMessage('-1 200,50 продукты, ашан', today), { type: 'expense', amount: 1200.5, category: 'продукты', note: 'ашан' })
  assert.deepEqual(parseMessage('доход 120к зарплата', today), { type: 'income', amount: 120000, category: 'зарплата', note: null })
  assert.equal(parseMessage('расход кафе', today).type, 'error')
})

test('bare amounts become money, times and verbs stay tasks', () => {
  assert.deepEqual(parseMessage('кофе 400', today), { type: 'expense', amount: 400, category: 'кофе', note: null })
  assert.deepEqual(parseMessage('400 кофе', today), { type: 'expense', amount: 400, category: 'кофе', note: null })
  assert.deepEqual(parseMessage('такси до дома 350р', today), { type: 'expense', amount: 350, category: 'такси', note: 'до дома' })
  assert.deepEqual(parseMessage('кофе за 300', today), { type: 'expense', amount: 300, category: 'кофе', note: null })
  assert.equal(parseMessage('зарплата 120к', today).type, 'income')
  for (const text of ['встреча в 15', 'созвон к 10', 'прочитать 30 страниц', 'такси завтра 500', 'отчёт 05.11', '2 молока', 'купить молоко']) {
    assert.equal(parseMessage(text, today).type, 'task', text)
  }
})

test('mini app initData signature', () => {
  const token = '123:ABC'
  const sign = (fields: Record<string, string>) => {
    const check = Object.entries(fields)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
    const secret = createHmac('sha256', 'WebAppData').update(token).digest()
    return new URLSearchParams({ ...fields, hash: createHmac('sha256', secret).update(check).digest('hex') }).toString()
  }
  const now = Date.now()
  const fields = { auth_date: String(Math.floor(now / 1000)), user: JSON.stringify({ id: 42, first_name: 'Т' }), query_id: 'q' }
  assert.equal(verifyInitData(sign(fields), token, now), 42)
  assert.equal(verifyInitData(sign(fields), 'другой:токен', now), null, 'signed by another bot')
  assert.equal(verifyInitData(sign(fields).replace('42', '43'), token, now), null, 'tampered user')
  assert.equal(verifyInitData(sign(fields), token, now + 2 * 86400_000), null, 'expired')
  assert.equal(verifyInitData('user=%7B%22id%22%3A42%7D', token, now), null, 'no hash')
})

test('task messages pick up dates and times', () => {
  assert.deepEqual(parseMessage('купить молоко', today), { type: 'task', title: 'Купить молоко', due_date: today, due_time: null })
  assert.deepEqual(parseMessage('задача позвонить Ирине завтра в 15:00', today), {
    type: 'task',
    title: 'Позвонить Ирине',
    due_date: '2026-10-04',
    due_time: '15:00',
  })
  assert.deepEqual(parseMessage('встреча в пятницу в 10', today), { type: 'task', title: 'Встреча', due_date: '2026-10-09', due_time: '10:00' })
  assert.equal(dueOf('отчёт 05.11'), '2026-11-05')
  assert.equal(dueOf('отчёт 05.01'), '2027-01-05')
  assert.equal(dueOf('через 3 дня сдать отчёт'), '2026-10-06')
})

test('commands', () => {
  for (const [text, type] of [
    ['сегодня', 'today'],
    ['/today', 'today'],
    ['привычки', 'habits'],
    ['неделя', 'week'],
    ['/help', 'help'],
  ]) {
    assert.equal(parseMessage(text, today).type, type, text)
  }
})

test('recurrence', () => {
  assert.equal(nextDueDate({ repeat: 'daily', due_date: today }, today), '2026-10-04')
  assert.equal(nextDueDate({ repeat: 'daily', due_date: '2026-09-01' }, today), '2026-10-04', 'overdue daily never lands in the past')
  assert.equal(nextDueDate({ repeat: 'weekdays', due_date: '2026-10-02' }, today), '2026-10-05')
  assert.equal(nextDueDate({ repeat: 'weekly', repeat_days: [2, 4], due_date: today }, today), '2026-10-06')
  assert.equal(nextDueDate({ repeat: 'interval', repeat_interval: 3, due_date: '2026-10-01' }, today), '2026-10-04')
  assert.equal(nextDueDate({ repeat: 'monthly', due_date: '2026-01-31' }, '2026-03-01'), '2026-03-31', 'no day-of-month drift')
  assert.equal(nextDueDate({ repeat: 'yearly', due_date: '2024-02-29' }, today), '2027-02-28')
  assert.equal(nextDueDate({ repeat: null, due_date: today }, today), null)
})

test('time helpers', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28')
  assert.equal(weekday('2026-10-05'), 1)
  const at = new Date('2026-10-02T22:30:00Z')
  assert.equal(nowIn('Europe/Moscow', at).date, '2026-10-03')
  assert.equal(nowIn('Europe/Moscow', at).time, '01:30')
  assert.equal(nowIn('America/New_York', at).date, '2026-10-02')
  assert.equal(nowIn('Not/AZone', at).date, '2026-10-03', 'invalid zone falls back to the default')
})
