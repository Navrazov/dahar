import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createUser, login, PNG, pool, query, resetDatabase, startApp } from './helpers.js'
import { handleUpdate } from '../src/modules/telegram/bot.js'
import { sendDigests } from '../src/jobs/digest.js'
import { sendReminders } from '../src/jobs/reminders.js'
import { migrations, runMigrations } from '../src/db/migrations.js'
import { nowIn } from '../src/lib/time.js'

let app, user, userId

function fakeOut() {
  const sent = []
  return {
    sent,
    send: async (chat, text, buttons) => sent.push({ chat, text, buttons }),
    edit: async (chat, id, text, buttons) => sent.push({ chat, edit: id, text, buttons }),
    answer: async (id, text) => sent.push({ answer: id, text }),
  }
}

before(async () => {
  await resetDatabase()
  app = await startApp()
  userId = await createUser('tim')
  user = await login(app.base, 'tim')
  await user.put('/api/settings/timezone', { value: 'Europe/Moscow' })
})

after(async () => {
  await app.close()
  await pool.end()
})

test('sales move stock both ways', async () => {
  const p = (await user.post('/api/products', { name: 'Духи', stock: 10 })).body
  const s = (await user.post('/api/sales', { date: '2026-10-01', product_id: p.id, quantity: 3, amount: 300 })).body
  assert.equal((await user.get(`/api/products/${p.id}`)).body.stock, 7)
  await user.patch(`/api/sales/${s.id}`, { quantity: 5 })
  assert.equal((await user.get(`/api/products/${p.id}`)).body.stock, 5)
  await user.del(`/api/sales/${s.id}`)
  assert.equal((await user.get(`/api/products/${p.id}`)).body.stock, 10)
})

test('money keeps kopecks exactly', async () => {
  const t = (await user.post('/api/transactions', { date: '2026-10-01', kind: 'expense', amount: 0.1 })).body
  await user.post('/api/transactions', { date: '2026-10-01', kind: 'expense', amount: 0.2 })
  assert.equal(t.amount, 0.1)
  const summary = (await user.get('/api/finance/summary?month=2026-10')).body
  assert.equal(summary.expense, 0.3, 'numeric sum, not 0.30000000000000004')
})

test('completing a repeating task creates the next one exactly once', async () => {
  const today = nowIn('Europe/Moscow').date
  const t = (await user.post('/api/tasks', { title: 'Зарядка', due_date: today, repeat: 'daily', status: 'todo' })).body
  const done = (await user.patch(`/api/tasks/${t.id}`, { status: 'done' })).body
  assert.ok(done.completed_at, 'completion time recorded')
  let all = (await user.get('/api/tasks')).body.filter((x) => x.title === 'Зарядка')
  assert.equal(all.length, 2)
  const next = all.find((x) => x.id !== t.id)
  assert.equal(next.status, 'todo')
  assert.ok(next.due_date > today)
  assert.equal(next.repeat, 'daily')

  await user.patch(`/api/tasks/${t.id}`, { status: 'todo' })
  await user.patch(`/api/tasks/${t.id}`, { status: 'done' })
  all = (await user.get('/api/tasks')).body.filter((x) => x.title === 'Зарядка')
  assert.equal(all.length, 2, 'toggling again does not duplicate')
})

test('clients cannot set internal bookkeeping columns', async () => {
  const t = (await user.post('/api/tasks', { title: 'x', repeat: 'daily', repeat_spawned: true, reminded_at: 'now' })).body
  assert.equal(t.repeat_spawned, null)
  assert.equal(t.reminded_at, null)
})

test('partner reports hold exact turnover', async () => {
  const p = (await user.post('/api/partners', { name: 'Алексей' })).body
  await user.post('/api/partner_reports', { partner_id: p.id, date: '2026-09-30', applications: 10, approvals: 6, turnover: 100000.1 })
  const reports = (await user.get(`/api/partner_reports?partner_id=${p.id}`)).body
  assert.equal(reports[0].turnover, 100000.1)
})

test('period filters', async () => {
  await user.post('/api/transactions', { date: '2026-08-15', kind: 'income', amount: 1 })
  const sep = (await user.get('/api/transactions?from=2026-09-01&to=2026-09-30')).body
  assert.equal(sep.length, 0)
  const aug = (await user.get('/api/transactions?from=2026-08-01&to=2026-08-31')).body
  assert.equal(aug.length, 1)
})

test('telegram bot: link, capture, list, complete', async () => {
  const out = fakeOut()
  const chat = { id: 777, type: 'private' }

  await handleUpdate({ message: { chat, text: 'купить хлеб' } }, out)
  assert.match(out.sent.at(-1).text, /Привяжите|привязать/i, 'unknown chat gets instructions')

  await query(`INSERT INTO telegram_codes (code, user_id, expires_at) VALUES ('abc123', $1, now() + interval '5 minutes')`, [userId])
  await handleUpdate({ message: { chat, text: '/start abc123' } }, out)
  assert.match(out.sent.at(-1).text, /привязан/)
  assert.equal((await query('SELECT telegram_chat_id FROM users WHERE id = $1', [userId])).rows[0].telegram_chat_id, 777)

  await user.post('/api/budgets', { category: 'Кафе', amount: 400 })
  await handleUpdate({ message: { chat, text: 'расход 500 кафе' } }, out)
  assert.match(out.sent.at(-1).text, /Бюджет «Кафе» превышен/)
  const tx = (await user.get('/api/transactions')).body.find((t) => t.amount === 500)
  assert.equal(tx.category, 'Кафе', 'category matched to the existing one')

  await handleUpdate({ message: { chat, text: 'позвонить Ирине завтра в 15:00' } }, out)
  const task = (await user.get('/api/tasks')).body.find((t) => t.title === 'Позвонить Ирине')
  assert.equal(task.due_time, '15:00')

  await handleUpdate({ callback_query: { id: 'cb1', data: `done:${task.id}`, message: { chat, message_id: 1, text: '✅ Задача' } } }, out)
  assert.equal((await user.get(`/api/tasks/${task.id}`)).body.status, 'done')

  await handleUpdate({ callback_query: { id: 'cb2', data: `done:${task.id}`, message: { chat: { id: 999 }, message_id: 2 } } }, out)
  assert.match(out.sent.at(-1).text, /привяжите/i)
})

test('reminders fire once at the due time and re-arm when rescheduled', async () => {
  const now = nowIn('Europe/Moscow')
  const t = (await user.post('/api/tasks', { title: 'Созвон', due_date: now.date, due_time: '00:00', status: 'todo' })).body
  const out = fakeOut()
  assert.ok((await sendReminders(out)) >= 1)
  assert.ok(out.sent.some((m) => m.text.includes('Созвон')))
  assert.equal(await sendReminders(out), 0, 'not twice')
  await user.patch(`/api/tasks/${t.id}`, { due_time: '00:01' })
  assert.equal(await sendReminders(out), 1, 'rescheduling re-arms')
})

test('morning digest goes out once a day', async () => {
  await user.put('/api/settings/digest_hour', { value: 0 })
  const out = fakeOut()
  const at = new Date()
  assert.equal(await sendDigests(out, at), nowIn('Europe/Moscow', at).hour < 3 ? 1 : 0)
  assert.equal(await sendDigests(out, at), 0)
})

test('migrations upgrade an old database', async () => {
  const [{ id: uid }] = (await query(`INSERT INTO users (login, password_hash) VALUES ('old', 'x') RETURNING id`)).rows
  await query('ALTER TABLE trades ALTER COLUMN pnl TYPE double precision')
  await query('ALTER TABLE partners ADD COLUMN applications integer, ADD COLUMN approvals integer, ADD COLUMN turnover double precision, ADD COLUMN profit double precision')
  await query(`INSERT INTO partners (user_id, name, applications, approvals, turnover, profit) VALUES ($1, 'Old partner', 7, 4, 1234.5, 100)`, [uid])
  await query(`INSERT INTO trades (user_id, date, pnl, screenshot) VALUES ($1, '2026-01-01', 1.005, $2)`, [uid, PNG])
  await query('DELETE FROM schema_migrations')

  await runMigrations({ log: () => {} })

  const type = (await query(`SELECT data_type FROM information_schema.columns WHERE table_name = 'trades' AND column_name = 'pnl'`)).rows[0].data_type
  assert.equal(type, 'numeric')
  const cols = (await query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'partners'`)).rows.map((r) => r.column_name)
  assert.ok(!cols.includes('applications'), 'counter columns dropped')
  const report = (await query(`SELECT r.* FROM partner_reports r JOIN partners p ON p.id = r.partner_id WHERE p.name = 'Old partner'`)).rows[0]
  assert.equal(report.applications, 7)
  assert.equal(report.turnover, 1234.5)
  const trade = (await query('SELECT screenshot FROM trades WHERE user_id = $1', [uid])).rows[0]
  assert.match(trade.screenshot, /^\/api\/files\/[0-9a-f-]{36}$/)
  assert.equal((await query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n, migrations.length)
})
