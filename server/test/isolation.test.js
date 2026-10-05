import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createUser, login, PNG, pool, resetDatabase, startApp } from './helpers.js'
import { schema, tableOrder, isRef } from '../src/db/schema.js'

let app, alice, bob
const aliceRows = {}

function bodyFor(table, rows) {
  const ref = (t) => rows[t]?.id
  const bodies = {
    projects: { name: 'Секретный проект' },
    goals: { title: 'Цель', project_id: ref('projects'), target_value: 10 },
    partners: { name: 'Партнёр', project_id: ref('projects') },
    partner_reports: { partner_id: ref('partners'), date: '2026-10-01', applications: 3, turnover: 1000.55 },
    tasks: { title: 'Задача', project_id: ref('projects'), partner_id: ref('partners'), goal_id: ref('goals'), status: 'todo' },
    events: { title: 'Событие', start: '2026-10-03T10:00', project_id: ref('projects'), partner_id: ref('partners') },
    habits: { name: 'Привычка', project_id: ref('projects') },
    habit_logs: { habit_id: ref('habits'), date: '2026-10-01', status: 'done' },
    partner_interactions: { partner_id: ref('partners'), date: '2026-10-01', note: 'звонок' },
    trades: { date: '2026-10-01', instrument: 'BTCUSDT', pnl: 12.34, project_id: ref('projects') },
    trading_topics: { title: 'Тема', project_id: ref('projects') },
    products: { name: 'Товар', stock: 5, sale_price: 100, project_id: ref('projects') },
    customers: { name: 'Клиент' },
    sales: { date: '2026-10-01', product_id: ref('products'), customer_id: ref('customers'), quantity: 1, amount: 100, project_id: ref('projects') },
    biz_expenses: { date: '2026-10-01', amount: 50, project_id: ref('projects') },
    content: { title: 'Reels', project_id: ref('projects') },
    accounts: { name: 'Карта', initial_balance: 1000 },
    transactions: { date: '2026-10-01', kind: 'expense', amount: 5, account_id: ref('accounts'), project_id: ref('projects') },
    budgets: { category: 'Кафе', amount: 100 },
    reviews: { week_start: '2026-09-28', wins: 'секрет' },
  }
  assert.ok(bodies[table], `test fixture missing for table ${table} — add it to bodyFor()`)
  return bodies[table]
}

before(async () => {
  await resetDatabase()
  app = await startApp()
  await createUser('alice')
  await createUser('bob')
  alice = await login(app.base, 'alice')
  bob = await login(app.base, 'bob')
  for (const t of tableOrder) {
    const r = await alice.post(`/api/${t}`, bodyFor(t, aliceRows))
    assert.equal(r.status, 201, `alice creates ${t}: ${JSON.stringify(r.body)}`)
    aliceRows[t] = r.body
  }
})

after(async () => {
  await app.close()
  await pool.end()
})

test('every route requires a session', async () => {
  for (const path of ['/api/projects', '/api/settings', '/api/backup', '/api/finance/summary', '/api/telegram', `/api/files/00000000-0000-0000-0000-000000000000`]) {
    const r = await fetch(`${app.base}${path}`)
    assert.equal(r.status, 401, path)
  }
})

test('lists, reads and filters never show another user’s rows', async () => {
  for (const t of tableOrder) {
    const id = aliceRows[t].id
    assert.deepEqual((await bob.get(`/api/${t}`)).body, [], `bob list ${t}`)
    assert.deepEqual((await bob.get(`/api/${t}?user_id=1`)).body, [], `bob list ${t} with user_id filter`)
    assert.equal((await bob.get(`/api/${t}/${id}`)).status, 404, `bob read ${t}`)
    assert.equal((await alice.get(`/api/${t}/${id}`)).status, 200, `alice read ${t}`)
  }
})

test('updates and deletes of another user’s rows fail and change nothing', async () => {
  for (const t of [...tableOrder].reverse()) {
    const id = aliceRows[t].id
    const firstText = Object.entries(schema[t]).find(([, type]) => type === 'text')?.[0]
    assert.equal((await bob.patch(`/api/${t}/${id}`, { [firstText]: 'hacked' })).status, 404, `bob patch ${t}`)
    assert.equal((await bob.del(`/api/${t}/${id}`)).status, 404, `bob delete ${t}`)
    const still = await alice.get(`/api/${t}/${id}`)
    assert.equal(still.status, 200, `${t} survives`)
    assert.notEqual(still.body[firstText], 'hacked', `${t} unchanged`)
  }
})

test('rows cannot link to another user’s rows', async () => {
  const bobRows = {}
  for (const t of tableOrder) bobRows[t] = (await bob.post(`/api/${t}`, bodyFor(t, bobRows))).body
  for (const t of tableOrder) {
    for (const [col, type] of Object.entries(schema[t])) {
      if (!isRef(type)) continue
      const body = { ...bodyFor(t, bobRows), [col]: aliceRows[type.ref].id }
      const created = await bob.post(`/api/${t}`, body)
      assert.equal(created.status, 400, `bob creates ${t}.${col} → alice's ${type.ref}`)
      const patched = await bob.patch(`/api/${t}/${bobRows[t].id}`, { [col]: aliceRows[type.ref].id })
      assert.equal(patched.status, 400, `bob patches ${t}.${col} → alice's ${type.ref}`)
    }
  }
})

test('habit check-ins, settings, files and summaries are per user', async () => {
  assert.equal((await bob.put('/api/habit-log', { habit_id: aliceRows.habits.id, date: '2026-10-02', status: 'done' })).status, 404)

  await alice.put('/api/settings/currency', { value: '$' })
  assert.equal((await bob.get('/api/settings')).body.currency, undefined)

  const file = await alice.post('/api/files', { data: PNG })
  assert.equal(file.status, 201)
  assert.equal((await alice.get(file.body.url)).status, 200)
  assert.equal((await bob.get(file.body.url)).status, 404)

  const summary = (await bob.get('/api/finance/summary?month=2026-10')).body
  assert.ok(summary.balances.every((b) => b.account_id !== aliceRows.accounts.id))
  assert.ok(!summary.budgets.some((b) => b.id === aliceRows.budgets.id))
})

test('backup holds only own data; restore leaves other users alone', async () => {
  const backup = (await bob.get('/api/backup')).body
  for (const t of tableOrder) {
    assert.ok(backup.data[t].every((r) => r.id !== aliceRows[t].id), `bob's backup has no alice ${t}`)
  }
  assert.equal(backup.settings.currency, undefined)

  assert.equal((await bob.post('/api/restore', { data: {} })).status, 200)
  assert.deepEqual((await bob.get('/api/projects')).body, [])
  assert.equal((await alice.get('/api/projects')).body.length, 1, 'alice keeps her data')
})

test('telegram linking is unavailable without a bot token, and never cross-user', async () => {
  assert.equal((await bob.post('/api/telegram/code')).status, 400)
  assert.equal((await bob.get('/api/telegram')).body.linked, false)
})

test('writes must be JSON (CSRF guard)', async () => {
  const r = await fetch(`${app.base}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'name=x' })
  assert.equal(r.status, 415)
})
