import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createUser, login, pool, resetDatabase, startApp, type App, type Client } from './helpers.ts'

let app: App, user: Client

before(async () => {
  await resetDatabase()
  app = await startApp()
  await createUser('val')
  user = await login(app.base, 'val')
})

after(async () => {
  await app.close()
  await pool.end()
})

test('invalid values are rejected with a clear 400', async () => {
  const cases: [string, Record<string, unknown>, RegExp][] = [
    ['tasks', { title: 'x', status: 'maybe' }, /status/],
    ['tasks', { title: 'x', due_date: '2026-02-30' }, /due_date/],
    ['tasks', { title: 'x', due_time: '25:00' }, /due_time/],
    ['tasks', { title: '   ' }, /title/],
    ['tasks', { title: 'x'.repeat(201) }, /title/],
    ['tasks', { title: 'x', repeat_days: [0, 8] }, /repeat_days/],
    ['projects', { name: 'p', progress: 150 }, /progress/],
    ['projects', { name: 'p', color: 'red; background:url(x)' }, /color/],
    ['partners', { name: 'p', email: 'not-an-email' }, /email/],
    ['transactions', { date: '2026-10-01', kind: 'expense', amount: -5 }, /amount/],
    ['transactions', { date: '2026-10-01', kind: 'expense', amount: 'abc' }, /amount/],
    ['transactions', { kind: 'expense', amount: 5 }, /date/],
    ['events', { title: 'e', start: 'tomorrow' }, /start/],
  ]
  for (const [table, body, field] of cases) {
    const r = await user.post(`/api/${table}`, body)
    assert.equal(r.status, 400, `${table} ${JSON.stringify(body)} → ${r.status}`)
    assert.match(r.body.error, field)
  }
})

test('values are normalized on the way in', async () => {
  const t = (await user.post('/api/tasks', { title: 'Норма', due_time: '9:05', repeat_days: [5, 1, 1], status: '', unknown: 'ignored' })).body
  assert.equal(t.due_time, '09:05')
  assert.deepEqual(t.repeat_days, [1, 5])
  assert.equal(t.status, null)
  assert.equal('unknown' in t, false)

  const e = (await user.post('/api/events', { title: 'Весь день', start: '2026-10-05', all_day: true })).body
  assert.equal(e.start, '2026-10-05T00:00', 'date-only start becomes midnight, API keeps the old string shape')

  const m = (await user.post('/api/transactions', { date: '2026-10-01', kind: 'income', amount: '10.555' })).body
  assert.equal(m.amount, 10.56)
})

test('partial updates validate only what is sent', async () => {
  const t = (await user.post('/api/tasks', { title: 'Частично' })).body
  assert.equal((await user.patch(`/api/tasks/${t.id}`, { priority: 'high' })).status, 200)
  assert.equal((await user.patch(`/api/tasks/${t.id}`, { title: null })).status, 400, 'required column cannot be cleared')
  assert.equal((await user.patch(`/api/tasks/${t.id}`, { priority: 'meh' })).status, 400)
})

test('list filters are validated too', async () => {
  assert.equal((await user.get('/api/tasks?project_id=abc')).status, 400)
  assert.equal((await user.get('/api/tasks?from=yesterday')).status, 400)
  assert.equal((await user.get('/api/tasks?status=todo')).status, 200)
})

test('date period filters use real dates, including timestamps', async () => {
  await user.post('/api/events', { title: 'Поздно вечером', start: '2026-03-31T23:30' })
  await user.post('/api/events', { title: 'Утром', start: '2026-04-01T08:00' })
  const march = (await user.get('/api/events?from=2026-03-01&to=2026-03-31')).body
  assert.deepEqual(
    march.map((e: { title: string }) => e.title),
    ['Поздно вечером'],
  )
})

test('request bodies are capped: 1 MB for records, 25 MB for uploads', async () => {
  const big = 'x'.repeat(1_200_000)
  const r = await fetch(`${app.base}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: user.cookie ?? '' },
    body: JSON.stringify({ title: 't', description: big }),
  })
  assert.equal(r.status, 413)
})

test('security headers are set on every response', async () => {
  const r = await fetch(`${app.base}/api/health`)
  const csp = r.headers.get('content-security-policy') ?? ''
  assert.match(csp, /default-src 'self'/)
  assert.match(csp, /script-src 'self'(;|$)/, 'no inline scripts allowed')
  assert.match(csp, /frame-ancestors 'none'/)
  assert.equal(r.headers.get('x-frame-options'), 'DENY')
  assert.equal(r.headers.get('x-powered-by'), null)
})
