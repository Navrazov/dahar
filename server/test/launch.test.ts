import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createUser, login, pool, query, resetDatabase, startApp, type App, type Client } from './helpers.ts'
import { consumeLimit } from '../src/lib/rate-limit.ts'
import { collectWeek } from '../src/modules/insights/week-data.ts'
import { deliver } from '../src/jobs/delivery.ts'
import { isValidSubscription } from '../src/modules/push/push.service.ts'
import { config } from '../src/config.ts'
let app: App, user: Client, userId: number
before(async () => {
  await resetDatabase()
  app = await startApp()
  userId = await createUser('launch')
  user = await login(app.base, 'launch')
})
after(async () => {
  await app.close()
  await pool.end()
})

test('budgets normalize spaces and case and return a domain conflict', async () => {
  assert.equal((await user.post('/api/budgets', { category: '  Eating   out ', amount: 1000 })).status, 201)
  const duplicate = await user.post('/api/budgets', { category: 'eating out', amount: 2000 })
  assert.equal(duplicate.status, 409)
  assert.match(duplicate.body.error, /уже существует/)
})
test('foreign currency is rejected and preview fields cannot be changed at commit', async () => {
  const account = (await user.post('/api/accounts', { name: 'Bank' })).body
  const csv = (currency: string) =>
    Buffer.from(`Дата операции;Статус;Сумма платежа;Валюта платежа;Описание\n06.10.2026 12:00;OK;-100,00;${currency};Purchase`).toString('base64')
  assert.equal((await user.post('/api/finance/import/preview', { account_id: account.id, data: csv('USD') })).status, 400)
  const preview = (await user.post('/api/finance/import/preview', { account_id: account.id, data: csv('RUB') })).body
  assert.equal(preview.rows[0].currency, 'RUB')
  assert.equal((await user.post('/api/finance/import', { account_id: account.id, rows: [{ ...preview.rows[0], currency: 'USD' }] })).status, 400)
  assert.equal((await user.post('/api/finance/import', { account_id: account.id, rows: [{ ...preview.rows[0], amount: 500 }] })).status, 400)
  assert.equal((await user.post('/api/finance/import', { account_id: account.id, rows: preview.rows })).status, 200)
})
test('AI receives full counts when title lists are truncated', async () => {
  await query(`INSERT INTO tasks(user_id,title,status,completed_at) SELECT $1,'Done '||n,'done','2026-10-06T12:00'::timestamp FROM generate_series(1,49)n`, [
    userId,
  ])
  const week = await collectWeek(userId, '2026-10-05')
  assert.equal(week.tasks.done_count, 49)
  assert.equal(week.tasks.done.length, 40)
  assert.equal(week.tasks.done_truncated, true)
})
test('shared rate limit is atomic under concurrent requests', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => consumeLimit('launch-test', 'same', 3, 60000)))
  assert.equal(results.filter((wait) => wait === 0).length, 3)
  assert.equal(results.filter((wait) => wait > 0).length, 5)
})
test('slow notification transport does not block task writes', async () => {
  let release!: () => void
  let started!: () => void
  const begun = new Promise<void>((resolve) => {
    started = resolve
  })
  const blocked = new Promise<void>((resolve) => {
    release = resolve
  })
  const delivery = deliver(userId, 'slow-network', 'test', new Date(), async () => {
    started()
    await blocked
    return true
  })
  await begun
  try {
    const result = await Promise.race([
      user.post('/api/tasks', { title: 'Editable while transport waits' }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('CRUD blocked by transport')), 1500)),
    ])
    assert.equal(result.status, 201)
  } finally {
    release()
    await delivery
  }
})
test('old dataset operations are rejected after a restore', async () => {
  const version = (await user.get('/api/auth/me')).body.user.dataset_version
  const backup = (await user.get('/api/backup')).body
  assert.equal((await user.post('/api/restore', { ...backup, confirm: 'replace' })).status, 200)
  const response = await fetch(app.base + '/api/tasks', {
    method: 'POST',
    headers: { cookie: user.cookie!, 'Content-Type': 'application/json', 'X-Dahar-Dataset': String(version), 'Idempotency-Key': 'stale-operation-key' },
    body: JSON.stringify({ title: 'Must not appear' }),
  })
  assert.equal(response.status, 409)
  assert.ok(!(await user.get('/api/tasks')).body.some((task: { title: string }) => task.title === 'Must not appear'))
})
test('push endpoint and key validation excludes internal and untrusted services', () => {
  const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' }
  for (const endpoint of [
    'https://127.0.0.1/x',
    'https://localhost/x',
    'https://fcm.googleapis.com.evil.test/x',
    'https://user:secret@fcm.googleapis.com/x',
    'https://fcm.googleapis.com:444/x',
  ])
    assert.equal(isValidSubscription({ endpoint, keys }), false)
  assert.equal(isValidSubscription({ endpoint: 'https://fcm.googleapis.com/x', keys }), true)
  assert.equal(isValidSubscription({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'broken', auth: 'broken' } }), false)
})
test('registration starts trial, requires consent and handles duplicate names', async () => {
  const previous = config.registrationEnabled
  config.registrationEnabled = true
  try {
    const body = { login: 'new-launch', password: 'a-password-123' }
    const anon = { headers: { 'Content-Type': 'application/json' }, method: 'POST' }
    assert.equal((await fetch(app.base + '/api/auth/register', { ...anon, body: JSON.stringify(body) })).status, 400)
    const registered = await fetch(app.base + '/api/auth/register', { ...anon, body: JSON.stringify({ ...body, accepted_terms: true }) })
    assert.equal(registered.status, 201)
    const account = ((await registered.json()) as { user: { id: number } }).user
    const trial = (await query('SELECT trial_ends_at FROM users WHERE id=$1', [account.id])).rows[0].trial_ends_at
    assert.ok(new Date(trial).getTime() > Date.now() + 13 * 86400000)
    assert.equal((await fetch(app.base + '/api/auth/register', { ...anon, body: JSON.stringify({ ...body, accepted_terms: true }) })).status, 409)
  } finally {
    config.registrationEnabled = previous
  }
})
test('session revocation is scoped to owner and keeps the current device', async () => {
  const another = await login(app.base, 'launch')
  assert.equal((await user.get('/api/auth/sessions')).body.length, 2)
  assert.equal((await user.post('/api/auth/sessions/revoke-others')).status, 200)
  assert.equal((await another.get('/api/auth/me')).status, 401)
  assert.equal((await user.get('/api/auth/me')).status, 200)
})

test('task estimates and checklist survive writes and repeats reset completed steps', async () => {
  assert.equal((await user.post('/api/tasks', { title: 'Too long', estimate_minutes: 1441 })).status, 400)
  const task = (
    await user.post('/api/tasks', {
      title: 'Repeating checklist',
      estimate_minutes: 25,
      checklist: 'First step\n- [x] Second step',
      repeat: 'daily',
      due_date: '2026-10-06',
    })
  ).body
  assert.equal(task.estimate_minutes, 25)
  assert.equal(task.checklist, '- [ ] First step\n- [x] Second step')
  assert.equal((await user.patch(`/api/tasks/${task.id}`, { status: 'done' })).status, 200)
  const next = (await user.get('/api/tasks')).body.find(
    (row: { id: number; title: string; status: string }) => row.id !== task.id && row.title === task.title && row.status === 'todo',
  )
  assert.equal(next.estimate_minutes, 25)
  assert.equal(next.checklist, '- [ ] First step\n- [ ] Second step')
})
test('deleting account queues S3 cleanup without losing object keys', async () => {
  const id = await createUser('delete-launch')
  const account = await login(app.base, 'delete-launch')
  await query("INSERT INTO files(user_id,mime,size,storage_key) VALUES($1,'image/png',100,$2)", [id, `${id}/pending-file`])
  assert.equal((await account.del('/api/auth/account', { confirm: 'delete', password: 'wrong' })).status, 400)
  assert.equal((await account.del('/api/auth/account', { confirm: 'delete', password: 'password123' })).status, 200)
  assert.equal((await query('SELECT 1 FROM users WHERE id=$1', [id])).rowCount, 0)
  assert.equal((await query('SELECT 1 FROM file_deletions WHERE storage_key=$1', [`${id}/pending-file`])).rowCount, 1)
  assert.equal((await account.get('/api/auth/me')).status, 401)
})

test('AI retries reuse successful results and malformed responses refund the monthly quota', async () => {
  const { createInsight } = await import('../src/modules/insights/insights.service.ts')
  let calls = 0
  const generate = async () => {
    calls++
    return { summary: 'Valid', wins: [], attention: [], money: 'None', habits: 'None', next_week: [] }
  }
  const first = await createInsight(userId, '2026-10-05', generate, 'insight-retry-operation')
  const second = await createInsight(userId, '2026-10-05', generate, 'insight-retry-operation')
  assert.equal(first.summary, second.summary)
  assert.equal(calls, 1)
  await assert.rejects(() => createInsight(userId, '2026-10-05', async () => ({ summary: 42 }) as any, 'malformed-insight-operation'), /Некорректный/)
  assert.equal((await query("SELECT count FROM rate_limits WHERE key LIKE 'insight-month:%'")).rows[0].count, 1)
})

test('statements without currency require explicit confirmation and cannot import silently', async () => {
  const account = (await user.post('/api/accounts', { name: 'Unspecified currency' })).body
  const data = Buffer.from('Date,Amount,Description\n2026-10-06,-200,Unknown currency').toString('base64')
  const preview = (await user.post('/api/finance/import/preview', { account_id: account.id, data })).body
  assert.equal(preview.rows[0].currency, '')
  assert.equal((await user.post('/api/finance/import', { account_id: account.id, rows: preview.rows })).status, 400)
  assert.equal((await user.post('/api/finance/import', { account_id: account.id, rows: preview.rows, confirm_currency: true })).status, 200)
})

test('parallel uploads cannot exceed the per-account file limit', async () => {
  const id = await createUser('files-launch')
  const account = await login(app.base, 'files-launch')
  await query("INSERT INTO files(user_id,mime,size) SELECT $1,'image/png',70 FROM generate_series(1,498)", [id])
  const { PNG } = await import('./helpers.ts')
  const responses = await Promise.all(Array.from({ length: 3 }, () => account.post('/api/files', { data: PNG })))
  assert.equal(responses.filter((response) => response.status === 201).length, 2)
  assert.equal(responses.filter((response) => response.status === 400).length, 1)
  assert.equal((await query('SELECT count(*)::int AS n FROM files WHERE user_id=$1', [id])).rows[0].n, 500)
})
