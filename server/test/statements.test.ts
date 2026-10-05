import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createUser, login, pool, query, resetDatabase, startApp, type App, type Client } from './helpers.ts'
import { anyDate, parseGeneric } from '../src/modules/finance/import/generic.ts'
import { readCsv } from '../src/modules/finance/import/read.ts'
import { handleUpdate } from '../src/modules/telegram/bot.ts'

let app: App, user: Client, userId: number

const alfaLike = [
  'Тип счёта;Номер счета;Валюта;Дата операции;Референс проводки;Описание операции;Приход;Расход;',
  'Текущий счёт;40817810000000000001;RUR;12.09.24;CRD_1;Перекрёсток Москва;0;1 234,50;',
  'Текущий счёт;40817810000000000001;RUR;13.09.24;CRD_2;Зачисление зарплаты;150 000,00;0;',
  'Текущий счёт;40817810000000000001;RUR;;;Итого;150 000,00;1 234,50;',
].join('\n')

const vtbLike = [
  'Выписка по счёту',
  '',
  'Дата и время операции,Сумма операции,Категория,Описание,Статус',
  '"2024-09-14 18:30","-560,00 ₽","Кафе","Шоколадница","Исполнено"',
  '"2024-09-15 09:00","-99,00 ₽","Связь","МТС","Отклонено"',
  '"2024-09-16 10:15","+2 500,00 ₽","Переводы","Перевод от Ивана","Исполнено"',
].join('\n')

before(async () => {
  await resetDatabase()
  app = await startApp()
  userId = await createUser('stmt')
  user = await login(app.base, 'stmt')
})

after(async () => {
  await app.close()
  await pool.end()
})

test('dates in the usual bank formats', () => {
  assert.deepEqual(anyDate('12.09.24'), { date: '2024-09-12', time: '' })
  assert.deepEqual(anyDate('12.09.2024 19:20:11'), { date: '2024-09-12', time: '19:20' })
  assert.deepEqual(anyDate('2024-09-14 18:30'), { date: '2024-09-14', time: '18:30' })
  assert.equal(anyDate('Итого'), null)
})

test('any bank CSV with separate income and expense columns (Alfa-style)', () => {
  const rows = parseGeneric(readCsv(alfaLike))
  assert.deepEqual(
    rows.map((r) => [r.date, r.kind, r.amount, r.description]),
    [
      ['2024-09-12', 'expense', 1234.5, 'Перекрёсток Москва'],
      ['2024-09-13', 'income', 150000, 'Зачисление зарплаты'],
    ],
    'the totals line without a date is skipped',
  )
})

test('any bank CSV with one signed amount, currency signs and a status (VTB-style)', () => {
  const rows = parseGeneric(readCsv(vtbLike))
  assert.deepEqual(
    rows.map((r) => [r.date, r.time, r.kind, r.amount, r.bank_category]),
    [
      ['2024-09-14', '18:30', 'expense', 560, 'Кафе'],
      ['2024-09-16', '10:15', 'income', 2500, 'Переводы'],
    ],
    'declined operations are skipped',
  )
})

test('generic CSV goes through the regular preview', async () => {
  const account = (await user.post('/api/accounts', { name: 'Альфа', kind: 'card' })).body
  const res = await user.post('/api/finance/import/preview', { account_id: account.id, data: Buffer.from(alfaLike).toString('base64') })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.equal(res.body.bank, 'csv')
  assert.equal(res.body.rows.length, 2)
})

test('a statement forwarded to the bot is imported into the matching account, once', async () => {
  const card = (await user.post('/api/accounts', { name: 'ВТБ карта', kind: 'card' })).body
  await query('UPDATE users SET telegram_chat_id = 4242 WHERE id = $1', [userId])
  const sent: string[] = []
  const out = { send: async (_c: number, text: string) => sent.push(text), edit: async () => {}, answer: async () => {} }
  const deps = { download: async () => Buffer.from(vtbLike) }
  const message = { chat: { id: 4242, type: 'private' }, caption: 'втб', document: { file_id: 'f1', file_name: 'statement.csv', file_size: 400 } }

  await handleUpdate({ message }, out, deps)
  assert.match(sent.at(-1) ?? '', /CSV → «ВТБ карта»/)
  assert.match(sent.at(-1) ?? '', /Добавлено операций: <b>2<\/b>/)
  const txns = (await user.get(`/api/transactions?account_id=${card.id}`)).body
  assert.equal(txns.length, 2)

  await handleUpdate({ message }, out, deps)
  assert.match(sent.at(-1) ?? '', /Добавлено операций: <b>0<\/b>/)
  assert.match(sent.at(-1) ?? '', /пропущено: 2/)

  await handleUpdate({ message: { ...message, document: { file_id: 'f2', file_name: 'photo.jpg', file_size: 10 } } }, out, deps)
  assert.match(sent.at(-1) ?? '', /CSV или PDF/)
})
