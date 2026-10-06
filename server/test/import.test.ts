import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createUser, login, pool, resetDatabase, startApp, type App, type Client } from './helpers.ts'
import { merchantKey } from '../src/modules/finance/import/categories.ts'

let app: App, user: Client, other: Client

let tbank: any, sber: any

const tbankCsv = [
  '"Дата операции";"Дата платежа";"Номер карты";"Статус";"Сумма операции";"Валюта операции";"Сумма платежа";"Валюта платежа";"Кэшбэк";"Категория";"MCC";"Описание";"Бонусы (включая кэшбэк)";"Округление на инвесткопилку";"Сумма операции с округлением"',
  '"05.07.2024 19:20:11";"05.07.2024";"*1234";"OK";"-1350,00";"RUB";"-1350,00";"RUB";"";"Супермаркеты";"5411";"Пятёрочка";"13,00";"0,00";"1350,00"',
  '"05.07.2024 19:20:11";"05.07.2024";"*1234";"OK";"-1350,00";"RUB";"-1350,00";"RUB";"";"Супермаркеты";"5411";"Пятёрочка";"13,00";"0,00";"1350,00"',
  '"04.07.2024 08:00:00";"04.07.2024";"*1234";"FAILED";"-999,00";"RUB";"-999,00";"RUB";"";"Такси";"4121";"Яндекс Такси";"0,00";"0,00";"999,00"',
  '"03.07.2024 12:00:00";"03.07.2024";"";"OK";"150000,00";"RUB";"150000,00";"RUB";"";"Зарплата";"";"Зарплата ООО Ромашка";"0,00";"0,00";"150000,00"',
  '"02.07.2024 10:00:00";"02.07.2024";"*1234";"OK";"-20000,00";"RUB";"-20000,00";"RUB";"";"Переводы";"";"Перевод на карту Сбербанка";"0,00";"0,00";"20000,00"',
].join('\r\n')

const encode1251 = (s) => {
  const table = new Map()
  const dec = new TextDecoder('windows-1251')
  for (let b = 0; b < 256; b++) table.set(dec.decode(Uint8Array.of(b)), b)
  return Buffer.from([...s].map((ch) => table.get(ch) ?? 63))
}

before(async () => {
  await resetDatabase()
  app = await startApp()
  await createUser('tim')
  await createUser('eve')
  user = await login(app.base, 'tim')
  other = await login(app.base, 'eve')
  tbank = (await user.post('/api/accounts', { name: 'Т-Банк', kind: 'card' })).body
  sber = (await user.post('/api/accounts', { name: 'Сбер', kind: 'card' })).body
})

after(async () => {
  await app.close()
  await pool.end()
})

const save = (account, rows, edits = {}) =>
  user.post('/api/finance/import', {
    confirm_currency: true,
    account_id: account.id,
    rows: rows.filter((r) => !r.duplicate).map((r) => ({ ...r, match_id: r.match?.id ?? null, ...edits[r.description] })),
  })

test('t-bank csv in windows-1251: parses, maps categories, skips failed, keeps identical purchases', async () => {
  const res = await user.post('/api/finance/import/preview', { account_id: tbank.id, data: encode1251(tbankCsv).toString('base64') })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.equal(res.body.bank, 'tbank')
  const rows = res.body.rows
  assert.equal(rows.length, 4)
  assert.deepEqual(
    rows.map((r) => [r.date, r.kind, r.amount, r.category]),
    [
      ['2024-07-05', 'expense', 1350, 'Продукты'],
      ['2024-07-05', 'expense', 1350, 'Продукты'],
      ['2024-07-03', 'income', 150000, 'Зарплата'],
      ['2024-07-02', 'expense', 20000, 'Переводы'],
    ],
  )
  assert.notEqual(rows[0].key, rows[1].key)

  const saved = await save(tbank, rows, { 'Зарплата ООО Ромашка': { category: 'Работа', learn: true } })
  assert.deepEqual(saved.body, { created: 4, transfers: 0, skipped: 0 })

  const again = await user.post('/api/finance/import/preview', { account_id: tbank.id, data: Buffer.from(tbankCsv).toString('base64') })
  assert.ok(again.body.rows.every((r) => r.duplicate))
  assert.equal(again.body.rows.find((r) => r.kind === 'income').category, 'Работа')
  assert.deepEqual(
    (
      await save(
        tbank,
        again.body.rows.map((r) => ({ ...r, duplicate: false })),
      )
    ).body,
    { created: 0, transfers: 0, skipped: 4 },
  )
})

test('sber pdf: parses and turns a matching transfer between own accounts into one transfer', async () => {
  const data = readFileSync(new URL('./fixtures/sber.pdf', import.meta.url)).toString('base64')
  const res = await user.post('/api/finance/import/preview', { account_id: sber.id, data })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.equal(res.body.bank, 'sber')
  const rows = res.body.rows
  assert.deepEqual(
    rows.map((r) => [r.date, r.kind, r.amount, r.category, r.description]),
    [
      ['2024-07-03', 'expense', 1234.56, 'Продукты', 'PYATEROCHKA 1234 Moscow RUS'],
      ['2024-07-02', 'income', 20000, 'Переводы', 'Перевод от И. Иван Иванович'],
      ['2024-07-01', 'expense', 450, 'Кафе', 'KOFEMANIA Moscow RUS'],
    ],
  )
  assert.equal(rows[1].match?.account_id, tbank.id)

  assert.deepEqual((await save(sber, rows)).body, { created: 2, transfers: 1, skipped: 0 })
  const txns = (await user.get('/api/transactions')).body
  const transfer = txns.filter((t) => t.kind === 'transfer')
  assert.equal(transfer.length, 1)
  assert.equal(transfer[0].account_id, tbank.id)
  assert.equal(transfer[0].to_account_id, sber.id)
  assert.equal(txns.length, 6)

  const again = await user.post('/api/finance/import/preview', { account_id: sber.id, data })
  assert.ok(again.body.rows.every((r) => r.duplicate))
})

test('import is scoped to the owner', async () => {
  const data = Buffer.from(tbankCsv).toString('base64')
  assert.equal((await other.post('/api/finance/import/preview', { account_id: tbank.id, data })).status, 400)
  const mine = (await user.get('/api/transactions')).body.find((t) => t.kind === 'expense')
  const own = (await other.post('/api/accounts', { name: 'Карта' })).body
  const preview = (await other.post('/api/finance/import/preview', { account_id: own.id, data })).body
  assert.ok(preview.rows.every((r) => !r.duplicate && !r.match))
  const row = { ...preview.rows.find((r) => r.kind === 'expense'), match_id: mine.id }
  assert.deepEqual((await other.post('/api/finance/import', { account_id: own.id, rows: [row] })).body, { created: 1, transfers: 0, skipped: 0 })
  assert.equal((await user.get(`/api/transactions/${mine.id}`)).body.kind, 'expense')
})

test('unknown files are rejected with a clear message', async () => {
  const res = await user.post('/api/finance/import/preview', { account_id: tbank.id, data: Buffer.from('a,b\n1,2').toString('base64') })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /Т-Банк.*Сбер/)
})

test('merchant key ignores card numbers and digits', () => {
  assert.equal(merchantKey('PYATEROCHKA 1234 Moscow RUS'), 'PYATEROCHKA MOSCOW RUS')
  assert.equal(merchantKey('Оплата *4821 Яндекс.Еда'), 'ОПЛАТА ЯНДЕКС.ЕДА')
})
