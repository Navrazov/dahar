import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { adminLogin, client, createUser, login, pool, query, resetDatabase, startApp } from './helpers.js'
import { createAdmin } from '../src/modules/admin/admin.repository.js'

let app, admin, alice

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
  for (const path of ['/api/admin/overview', '/api/admin/users', '/api/admin/system', '/api/admin/errors', '/api/admin/audit']) {
    assert.equal((await anon.get(path)).status, 401, path)
    assert.equal((await alice.get(path)).status, 401, `${path} with a user session`)
  }
})

test('admin session does not open the user API', async () => {
  assert.equal((await client(app.base, admin.cookie).get('/api/tasks')).status, 401)
})

test('wrong admin password is rejected', async () => {
  const r = await fetch(`${app.base}/api/admin/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'Owner', password: 'nope' }) })
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
  const relogin = await fetch(`${app.base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'bob', password: 'bob-password' }) })
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
  assert.equal(r.cohorts.reduce((a, c) => a + c.size, 0), 1)
  assert.equal(r.cohorts[0].weeks[0], 1)
  assert.equal(r.top[0].login, 'alice')
})

test('system info and logout', async () => {
  const sys = (await admin.get('/api/admin/system')).body
  assert.ok(sys.database.tables.length > 0)
  assert.deepEqual(sys.migrations.pending, [])
  await admin.post('/api/admin/auth/logout')
  assert.equal((await admin.get('/api/admin/overview')).status, 401)
})
