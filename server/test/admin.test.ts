import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { adminLogin, client, createUser, login, pool, query, resetDatabase, startApp, type App, type Client } from './helpers.ts'
import { createAdmin } from '../src/modules/admin/admin.repository.ts'
import type { operations } from '../src/modules/admin/admin.reporting.ts'

let app: App, admin: Client, alice: Client

before(async () => {
  await resetDatabase()
  app = await startApp()
  await createAdmin('Owner', 'owner-secret-1')
  await createUser('alice')
  alice = await login(app.base, 'alice')
  await alice.post('/api/tasks', { title: 'Секретная задача', status: 'todo' })
  admin = await adminLogin(app.base, 'owner', 'owner-secret-1')
})

after(async () => {
  await app.close()
  await pool.end()
})

test('admin API is closed to anonymous visitors and to regular users', async () => {
  const anon = client(app.base)
  for (const path of [
    '/api/admin/overview',
    '/api/admin/users?paged=1',
    '/api/admin/system',
    '/api/admin/operations',
    '/api/admin/errors',
    '/api/admin/audit?paged=1',
  ]) {
    assert.equal((await anon.get(path)).status, 401, path)
    assert.equal((await alice.get(path)).status, 401, `${path} with a user session`)
  }
})

test('admin session does not open the user API', async () => {
  assert.equal((await client(app.base, admin.cookie).get('/api/tasks')).status, 401)
})

test('wrong admin password is rejected', async () => {
  const r = await fetch(`${app.base}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'Owner', password: 'nope' }),
  })
  assert.equal(r.status, 401)
})

test('overview counts users and records without exposing their content', async () => {
  const r = await admin.get('/api/admin/overview')
  assert.equal(r.status, 200)
  assert.equal(r.body.totals.users, 1)
  assert.ok(r.body.totals.records >= 1)
  assert.equal(r.body.daily.length, 90)
  assert.ok(!JSON.stringify(r.body).includes('Секретная задача'))

  const users = (await admin.get('/api/admin/users')).body
  const detail = (await admin.get(`/api/admin/users/${users[0].id}`)).body
  assert.equal(detail.login, 'alice')
  assert.ok(detail.collections.some((c) => c.collection === 'tasks' && c.total === 1))
  assert.ok(!JSON.stringify(detail).includes('Секретная задача'))
})

test('admin creates, blocks, unblocks and deletes a user', async () => {
  const created = await admin.post('/api/admin/users', { login: 'Bob', password: 'bob-password', name: 'Боб' })
  assert.equal(created.status, 201)
  assert.equal(created.body.login, 'bob')
  assert.equal((await admin.post('/api/admin/users', { login: 'bob', password: 'bob-password' })).status, 400, 'duplicate login')
  assert.equal((await admin.post('/api/admin/users', { login: 'x y', password: 'bob-password' })).status, 400, 'bad login')

  const bob = await login(app.base, 'bob', 'bob-password')
  assert.equal((await bob.get('/api/tasks')).status, 200)

  await admin.patch(`/api/admin/users/${created.body.id}`, { blocked: true })
  assert.equal((await bob.get('/api/tasks')).status, 401, 'blocked user is signed out')
  const relogin = await fetch(`${app.base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'bob', password: 'bob-password' }),
  })
  assert.equal(relogin.status, 403)

  await admin.patch(`/api/admin/users/${created.body.id}`, { blocked: false, password: 'new-password-1' })
  await login(app.base, 'bob', 'new-password-1')

  assert.equal((await admin.del(`/api/admin/users/${created.body.id}`, { confirm: 'wrong' })).status, 400)
  assert.equal((await admin.del(`/api/admin/users/${created.body.id}`, { confirm: 'bob' })).status, 200)
  assert.equal((await query(`SELECT count(*)::int AS n FROM users WHERE login = 'bob'`)).rows[0].n, 0)

  const actions = (await admin.get('/api/admin/audit')).body.map((a) => a.action)
  for (const a of ['user_create', 'user_block', 'user_unblock', 'user_password', 'user_delete', 'admin_login']) assert.ok(actions.includes(a), a)
})

test('ending sessions signs the user out everywhere', async () => {
  const id = (await query(`SELECT id FROM users WHERE login = 'alice'`)).rows[0].id
  const second = await login(app.base, 'alice')
  assert.equal((await admin.del(`/api/admin/users/${id}/sessions`)).body.ended >= 2, true)
  assert.equal((await second.get('/api/tasks')).status, 401)
  alice = await login(app.base, 'alice')
})

test('client errors are stored and visible to the admin', async () => {
  await alice.post('/api/client-errors', { message: 'Boom', url: '/tasks' })
  await new Promise((r) => setTimeout(r, 50))
  const errors = (await admin.get('/api/admin/errors?source=client')).body
  assert.ok(errors.items.some((e) => e.message === 'Boom' && e.user === 'alice'))
})

test('retention groups users by signup week', async () => {
  const r = (await admin.get('/api/admin/retention')).body
  assert.equal(
    r.cohorts.reduce((a, c) => a + c.size, 0),
    1,
  )
  assert.equal(r.cohorts[0].weeks[0], 1)
  assert.equal(r.top[0].login, 'alice')
})

test('paged users filter literal search, sort safely and count only requested rows', async () => {
  const bob = await createUser('page-bob')
  try {
    const first = (await admin.get('/api/admin/users?paged=1&limit=1&sort=oldest')).body
    const second = (await admin.get('/api/admin/users?paged=1&limit=1&offset=1&sort=oldest')).body
    assert.equal(first.total, 2)
    assert.equal(first.items.length, 1)
    assert.notEqual(first.items[0].id, second.items[0].id)
    assert.equal(first.items[0].records, 1)
    assert.equal(first.summary.total, 2)
    const searched = (await admin.get('/api/admin/users?paged=1&q=page-bob')).body
    assert.equal(searched.items[0].id, bob)
    assert.equal((await admin.get('/api/admin/users?paged=1&q=%25')).body.total, 0, 'percent is a literal, not wildcard')
    assert.equal(
      (await admin.get('/api/admin/users?paged=1&filter=idle')).body.items.some((u) => u.id === bob),
      true,
    )
    assert.equal((await admin.get('/api/admin/users?paged=1&limit=999999&sort=DROP%20TABLE%20users')).body.limit, 100)
  } finally {
    await query('DELETE FROM users WHERE id=$1', [bob])
  }
})

test('error chart, totals and groups use the same source, search and time window', async () => {
  const rows = (
    await query(`INSERT INTO error_log(source,message,created_at) VALUES
    ('server','admin-report-test_needle',now()),('server','admin-report-test_needle',now()),
    ('client','admin-report-test_needle',now()),('server','admin-report-test_needle',now()-interval '10 days'),
    ('server','admin-report-testXneedle',now()) RETURNING id`)
  ).rows
  try {
    const r = (await admin.get('/api/admin/errors?source=server&q=admin-report-test_needle&days=7&limit=1')).body
    assert.equal(r.total, 2)
    assert.equal(r.server, 2)
    assert.equal(r.client, 0)
    assert.equal(r.items.length, 1)
    assert.equal(r.daily.length, 7)
    assert.equal(
      r.daily.reduce((sum, d) => sum + d.value, 0),
      2,
    )
    assert.equal(r.groups[0].count, 2)
    const next = (await admin.get('/api/admin/errors?source=server&q=admin-report-test_needle&days=7&limit=1&offset=1')).body
    assert.notEqual(r.items[0].id, next.items[0].id)
  } finally {
    await query('DELETE FROM error_log WHERE id=ANY($1::bigint[])', [rows.map((r) => r.id)])
  }
})

test('admin account changes reject invalid fields before any mutation or audit', async () => {
  const user = (await query("SELECT id,name FROM users WHERE login='alice'")).rows[0]
  assert.equal((await admin.patch(`/api/admin/users/${user.id}`, { name: 'Should not change', password: 'weak' })).status, 400)
  assert.equal((await query('SELECT name FROM users WHERE id=$1', [user.id])).rows[0].name, user.name)
  assert.equal((await admin.patch(`/api/admin/users/${user.id}`, { blocked: 'false' })).status, 400)
  assert.equal((await admin.get('/api/admin/users/not-a-number')).status, 404)
  const audit = (await admin.get('/api/admin/audit?paged=1&action=admin_login&limit=1')).body
  assert.equal(audit.items.length, 1)
  assert.equal(audit.items[0].action, 'admin_login')
  assert.ok(audit.actions.some((a) => a.action === 'admin_login'))
})

test('operations exposes delivery receipts and security counts without tokens or private content', async () => {
  const id = (await query("SELECT id FROM users WHERE login='alice'")).rows[0].id
  await query(
    `INSERT INTO notification_deliveries(user_id,key,channel,attempts,delivered_at) VALUES
    ($1,'admin-report-fail','telegram',5,NULL),($1,'admin-report-ok','telegram',1,now()),($1,'admin-report-retry','push',2,NULL)`,
    [id],
  )
  try {
    const response = await fetch(app.base + '/api/admin/operations', { headers: { cookie: admin.cookie! } })
    const r = { status: response.status, body: (await response.json()) as Awaited<ReturnType<typeof operations>> }
    assert.equal(r.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const tg = r.body.deliveries.find((d) => d.channel === 'telegram')
    assert.ok(tg)
    assert.equal(tg.failed, 1)
    assert.equal(tg.delivered24, 1)
    const push = r.body.deliveries.find((d) => d.channel === 'push')
    assert.ok(push)
    assert.equal(push.pending, 1)
    assert.ok(r.body.pool.max > 0)
    assert.ok(!JSON.stringify(r.body).includes('Секретная задача'))
    const detail = (await admin.get(`/api/admin/users/${id}`)).body
    assert.equal(detail.two_factor, false)
    assert.equal(detail.health.failed_deliveries, 1)
    assert.ok(detail.milestones.some((m) => m.event === 'first_task'))
    assert.ok(!('totp_secret' in detail))
  } finally {
    await query("DELETE FROM notification_deliveries WHERE key LIKE 'admin-report-%'")
  }
})

test('past retention weeks without visits are zero while future weeks are unknown', async () => {
  const u = await createUser('past-cohort')
  try {
    await query("UPDATE users SET created_at=now()-interval '21 days' WHERE id=$1", [u])
    const data = (await admin.get('/api/admin/retention')).body
    const cohort = data.cohorts.find((c) => c.weeks[0] === 0)
    assert.ok(cohort)
    assert.equal(cohort.weeks[1], 0)
    assert.equal(cohort.weeks.at(-1), null)
  } finally {
    await query('DELETE FROM users WHERE id=$1', [u])
  }
})

test('system info and logout', async () => {
  const sys = (await admin.get('/api/admin/system')).body
  assert.ok(sys.database.tables.length > 0)
  assert.deepEqual(sys.migrations.pending, [])
  await admin.post('/api/admin/auth/logout')
  assert.equal((await admin.get('/api/admin/overview')).status, 401)
})
