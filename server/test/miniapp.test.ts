import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { client, createUser, login, pool, query, resetDatabase, startApp, type App, type Client } from './helpers.ts'
import { addDays, weekday } from '../src/lib/time.ts'
import { userNow } from '../src/modules/settings/settings.repository.ts'

let app: App, alice: Client, aliceId: number, bobId: number, date: string, project: number
before(async () => {
  await resetDatabase()
  app = await startApp()
  aliceId = await createUser('mini-alice')
  bobId = await createUser('mini-bob')
  alice = await login(app.base, 'mini-alice')
  date = (await userNow(aliceId)).date
  project = (await query("INSERT INTO projects(user_id,name) VALUES($1,'Mini project') RETURNING id", [aliceId])).rows[0].id
  await query("INSERT INTO tasks(user_id,title,due_date,project_id) SELECT $1,'Paged task '||i,$2::date,$3 FROM generate_series(1,65) i", [
    aliceId,
    date,
    project,
  ])
  await query(
    "INSERT INTO tasks(user_id,title,status,completed_at,project_id) SELECT $1,'Completed '||i,'done',$2::date + interval '12 hours',$3 FROM generate_series(1,60) i",
    [aliceId, date, project],
  )
  await query("INSERT INTO tasks(user_id,title,due_date) VALUES($1,'Other owner',$2::date),($3,'Literal 100%_ task',NULL),($3,'Future task',$2::date+1)", [
    bobId,
    date,
    aliceId,
  ])
})
after(async () => {
  await app.close()
  await pool.end()
})

test('Mini projections require a session and isolate owners', async () => {
  for (const path of ['/tasks', '/today', '/project-counts', `/week?week=${addDays(date, 1 - weekday(date))}`]) {
    assert.equal((await client(app.base).get('/api/mini' + path)).status, 401)
  }
  const response = await fetch(app.base + '/api/mini/tasks', { headers: { cookie: alice.cookie! } })
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const r = await alice.get('/api/mini/tasks')
  assert.equal(r.status, 200)
  assert.equal(r.body.total, 67)
  assert.equal(
    r.body.items.some((t) => t.title === 'Other owner'),
    false,
  )
  assert.equal(
    r.body.items.some((t) => 'user_id' in t),
    false,
  )
})
test('Task pages retain complete totals and have no overlapping rows', async () => {
  const a = (await alice.get('/api/mini/tasks?filter=today')).body
  const b = (await alice.get('/api/mini/tasks?filter=today&offset=50')).body
  assert.equal(a.total, 65)
  assert.equal(a.items.length, 50)
  assert.equal(b.items.length, 15)
  assert.equal(new Set([...a.items, ...b.items].map((t) => t.id)).size, 65)
  assert.equal((await alice.get('/api/mini/tasks?filter=done&limit=999')).body.items.length, 60)
  assert.equal((await alice.get('/api/mini/tasks?filter=inbox')).body.total, 1)
  assert.equal((await alice.get('/api/mini/tasks?filter=future')).body.total, 1)
  assert.equal((await alice.get(`/api/mini/tasks?project_id=${project}`)).body.total, 65)
})
test('Search treats wildcard characters literally and rejects invalid filters and pagination', async () => {
  assert.equal((await alice.get('/api/mini/tasks?q=%25_')).body.total, 1)
  for (const params of ['filter=unknown', 'offset=-1', 'limit=NaN', 'project_id=1%20OR%201=1'])
    assert.equal((await alice.get('/api/mini/tasks?' + params)).status, 400)
})
test('Today limits rendered buckets but retains full counters and separates focus', async () => {
  await query(
    "UPDATE tasks SET focus_date=$2::date WHERE id=(SELECT min(id) FROM tasks WHERE user_id=$1 AND status IS DISTINCT FROM 'done' AND due_date=$2::date)",
    [aliceId, date],
  )
  const r = (await alice.get('/api/mini/today')).body
  assert.equal(r.date, date)
  assert.equal(r.focus.total, 1)
  assert.equal(r.today.total, 64)
  assert.equal(r.today.items.length, 50)
  assert.equal(r.done.total, 60)
  assert.equal(r.done.items.length, 50)
  assert.equal(r.late.total, 0)
  assert.equal(new Set([...r.focus.items, ...r.today.items].map((t) => t.id)).size, 51)
})
test('Weekly and project projections count the full history without returning task content', async () => {
  const week = addDays(date, 1 - weekday(date)),
    r = (await alice.get(`/api/mini/week?week=${week}`)).body
  assert.deepEqual(r, { week, completed: 60, remaining_due: 65 })
  assert.deepEqual((await alice.get('/api/mini/project-counts')).body, [{ project_id: project, total: 125, done: 60 }])
  assert.equal((await alice.get('/api/mini/week?week=invalid')).status, 400)
  assert.equal((await alice.get(`/api/mini/week?week=${addDays(week, 1)}`)).status, 400)
})
