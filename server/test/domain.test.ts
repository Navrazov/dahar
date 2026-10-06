import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createUser, login, PNG, pool, query, resetDatabase, startApp, type App, type Client } from './helpers.ts'
import { handleUpdate } from '../src/modules/telegram/bot.ts'
import { sendDigests } from '../src/jobs/digest.ts'
import { sendReminders } from '../src/jobs/reminders.ts'
import { migrations, runMigrations } from '../src/db/migrations.ts'
import { nowIn } from '../src/lib/time.ts'
import { config } from '../src/config.ts'
import type { Buttons } from '../src/modules/telegram/transport.ts'

let app: App, user: Client, userId: number

interface Sent {
  chat?: number
  edit?: number
  answer?: string
  text?: string
  buttons?: Buttons
}

const lastText = (out: { sent: Sent[] }) => out.sent.at(-1)?.text ?? ''

function fakeOut() {
  const sent: Sent[] = []
  return {
    sent,
    send: async (chat: number, text: string, buttons?: Buttons) => sent.push({ chat, text, buttons }),
    edit: async (chat: number, id: number, text: string, buttons?: Buttons) => sent.push({ chat, edit: id, text, buttons }),
    answer: async (id: string, text?: string) => sent.push({ answer: id, text }),
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
  assert.match(lastText(out), /Привяжите|привязать/i, 'unknown chat gets instructions')

  await query(`INSERT INTO telegram_codes (code, user_id, expires_at) VALUES ('abc123', $1, now() + interval '5 minutes')`, [userId])
  await handleUpdate({ message: { chat, text: '/start abc123' } }, out)
  assert.match(lastText(out), /привязан/)
  assert.equal((await query('SELECT telegram_chat_id FROM users WHERE id = $1', [userId])).rows[0].telegram_chat_id, 777)

  await user.post('/api/budgets', { category: 'Кафе', amount: 400 })
  await handleUpdate({ message: { chat, text: 'расход 500 кафе' } }, out)
  assert.match(lastText(out), /Бюджет «Кафе» превышен/)
  const tx = (await user.get('/api/transactions')).body.find((t) => t.amount === 500)
  assert.equal(tx.category, 'Кафе', 'category matched to the existing one')

  await handleUpdate({ message: { chat, text: 'позвонить Ирине завтра в 15:00' } }, out)
  const task = (await user.get('/api/tasks')).body.find((t) => t.title === 'Позвонить Ирине')
  assert.equal(task.due_time, '15:00')

  await handleUpdate({ callback_query: { id: 'cb1', data: `done:${task.id}`, message: { chat, message_id: 1, text: '✅ Задача' } } }, out)
  assert.equal((await user.get(`/api/tasks/${task.id}`)).body.status, 'done')

  await handleUpdate({ callback_query: { id: 'cb2', data: `done:${task.id}`, message: { chat: { id: 999 }, message_id: 2 } } }, out)
  assert.match(lastText(out), /привяжите/i)
})

test('telegram bot: bare amounts, fixing mistakes, voice', async () => {
  const out = fakeOut()
  const chat = { id: 778, type: 'private' }
  const linked = (await query('SELECT telegram_chat_id FROM users WHERE id = $1', [userId])).rows[0].telegram_chat_id
  await query('UPDATE users SET telegram_chat_id = $1 WHERE id = $2', [chat.id, userId])
  const msg = (id: number) => ({ chat, message_id: id, text: '' })
  const txs = async () => (await user.get('/api/transactions')).body
  const tasks = async () => (await user.get('/api/tasks')).body

  await handleUpdate({ message: { chat, text: 'капучино 400' } }, out)
  let tx = (await txs()).find((t) => t.amount === 400)
  assert.equal(tx.kind, 'expense')
  assert.equal(tx.category, 'Капучино')

  await handleUpdate({ callback_query: { id: 'k', data: `kind:${tx.id}`, message: msg(10) } }, out)
  assert.equal((await user.get(`/api/transactions/${tx.id}`)).body.kind, 'income')

  await handleUpdate({ callback_query: { id: 't', data: `totask:${tx.id}`, message: msg(10) } }, out)
  assert.equal((await user.get(`/api/transactions/${tx.id}`)).status, 404)
  const task = (await tasks()).find((t) => t.title === 'Капучино 400')
  assert.ok(task, 'money turned into a task with the original text')

  await handleUpdate({ callback_query: { id: 'm', data: `tomoney:${task.id}`, message: msg(10) } }, out)
  tx = (await txs()).find((t) => t.amount === 400)
  assert.equal(tx.kind, 'expense')
  assert.equal((await user.get(`/api/tasks/${task.id}`)).status, 404)

  await handleUpdate({ callback_query: { id: 'd', data: `del:tx:${tx.id}`, message: msg(10) } }, out)
  assert.equal((await user.get(`/api/transactions/${tx.id}`)).status, 404)

  const deps = { download: async () => Buffer.from('ogg'), transcribe: async () => 'Обед 650.' }
  const prev = config.stt
  config.stt = { apiKey: 'k', baseUrl: 'http://stt', model: 'm' }
  try {
    await handleUpdate({ message: { chat, voice: { file_id: 'v1', duration: 3 } } }, out, deps)
  } finally {
    config.stt = prev
  }
  assert.ok(
    (await txs()).some((t) => t.amount === 650 && t.category === 'Обед'),
    'voice note became an expense',
  )
  assert.ok(
    out.sent.some((s) => s.text?.includes('Обед 650')),
    'transcript is echoed back',
  )

  await query('UPDATE users SET telegram_chat_id = $1 WHERE id = $2', [linked, userId])
})

test('reminders fire once at the due time and re-arm when rescheduled', async () => {
  const now = nowIn('Europe/Moscow')
  const t = (await user.post('/api/tasks', { title: 'Созвон', due_date: now.date, due_time: '00:00', status: 'todo' })).body
  const out = fakeOut()
  assert.ok((await sendReminders(out)) >= 1)
  assert.ok(out.sent.some((m) => m.text?.includes('Созвон')))
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
  await query(
    'ALTER TABLE partners ADD COLUMN applications integer, ADD COLUMN approvals integer, ADD COLUMN turnover double precision, ADD COLUMN profit double precision',
  )
  await query(`INSERT INTO partners (user_id, name, applications, approvals, turnover, profit) VALUES ($1, 'Old partner', 7, 4, 1234.5, 100)`, [uid])
  await query(`INSERT INTO trades (user_id, date, pnl, screenshot) VALUES ($1, '2026-01-01', 1.005, $2)`, [uid, PNG])
  await query('ALTER TABLE tasks ALTER COLUMN due_date TYPE text, ALTER COLUMN due_time TYPE text, ALTER COLUMN completed_at TYPE text')
  await query('ALTER TABLE events ALTER COLUMN start TYPE text')
  await query(
    `INSERT INTO tasks (user_id, title, due_date, due_time, completed_at) VALUES
       ($1, 'good', '2026-01-05', '9:30', '2026-01-05T18:45'),
       ($1, 'junk', '2026-02-30', 'later', 'now')`,
    [uid],
  )
  await query(`INSERT INTO events (user_id, title, start) VALUES ($1, 'ev', '2026-01-05T10:00')`, [uid])
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
  const types = (await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tasks'`)).rows
  const typeOf = (c: string) => types.find((r) => r.column_name === c)?.data_type
  assert.equal(typeOf('due_date'), 'date')
  assert.equal(typeOf('due_time'), 'time without time zone')
  assert.equal(typeOf('completed_at'), 'timestamp without time zone')
  const good = (await query(`SELECT due_date, due_time, completed_at FROM tasks WHERE user_id = $1 AND title = 'good'`, [uid])).rows[0]
  assert.deepEqual(good, { due_date: '2026-01-05', due_time: '09:30', completed_at: '2026-01-05T18:45' }, 'API still sees the same strings')
  const junk = (await query(`SELECT due_date, due_time, completed_at FROM tasks WHERE user_id = $1 AND title = 'junk'`, [uid])).rows[0]
  assert.deepEqual(junk, { due_date: null, due_time: null, completed_at: null }, 'unparseable values become NULL instead of failing')
  assert.equal((await query(`SELECT start FROM events WHERE user_id = $1`, [uid])).rows[0].start, '2026-01-05T10:00')
  assert.equal((await query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n, migrations.length)
})

test('typed-date migration can run twice on a reused connection', async () => {
  const migration = migrations.find((m) => m.id === '005_typed_dates')!
  const connection = await pool.connect()
  try {
    await migration.up(connection)
    await migration.up(connection)
    const result = await connection.query("SELECT pg_temp.dahar_date('2026-01-05') AS valid, pg_temp.dahar_date('2026-02-30') AS invalid")
    assert.deepEqual(result.rows[0], { valid: '2026-01-05', invalid: null })
  } finally {
    connection.release()
  }
})
