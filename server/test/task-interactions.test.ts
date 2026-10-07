import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createUser, login, pool, resetDatabase, startApp, type App, type Client } from './helpers.ts'
import { userNow } from '../src/modules/settings/settings.repository.ts'
import { addDays } from '../src/lib/time.ts'
let app: App, alice: Client, bob: Client, aliceId: number, date: string
before(async () => {
  await resetDatabase()
  app = await startApp()
  aliceId = await createUser('interactions-alice')
  await createUser('interactions-bob')
  alice = await login(app.base, 'interactions-alice')
  bob = await login(app.base, 'interactions-bob')
  date = (await userNow(aliceId)).date
})
after(async () => {
  await app.close()
  await pool.end()
})

test('unstarred undated and future-deadline tasks stay in Today without changing their deadlines', async () => {
  for (const deadline of [null, addDays(date, 7)]) {
    const task = (await alice.post('/api/tasks', { title: 'Keep in Today', due_date: deadline })).body
    const focused = (await alice.patch(`/api/tasks/${task.id}`, { focus_date: date })).body
    assert.equal(focused.planned_date, date)
    assert.equal(focused.due_date, deadline)
    const unfocused = (await alice.patch(`/api/tasks/${task.id}`, { focus_date: null })).body
    assert.equal(unfocused.planned_date, date)
    assert.equal(unfocused.due_date, deadline)
    const today = (await alice.get('/api/mini/today')).body
    assert.equal(
      today.today.items.some((t) => t.id === task.id),
      true,
    )
    assert.equal(
      today.focus.items.some((t) => t.id === task.id),
      false,
    )
    assert.equal(
      (await alice.get('/api/mini/tasks?filter=today')).body.items.some((t) => t.id === task.id),
      true,
    )
    await alice.del(`/api/tasks/${task.id}`)
  }
})
test('a deliberate reschedule clears today focus and keeps the chosen day', async () => {
  const t = (await alice.post('/api/tasks', { title: 'Move tomorrow', focus_date: date })).body
  const tomorrow = addDays(date, 1),
    result = await alice.patch(`/api/tasks/${t.id}`, { focus_date: null, planned_date: tomorrow, due_date: tomorrow })
  assert.equal(result.body.planned_date, tomorrow)
  assert.equal(result.body.focus_date, null)
  assert.equal(
    (await alice.get('/api/mini/today')).body.today.items.some((x) => x.id === t.id),
    false,
  )
})
test('reordering moves the task to the destination day and persists the order', async () => {
  const a = (await alice.post('/api/tasks', { title: 'Order A', due_date: date })).body,
    b = (await alice.post('/api/tasks', { title: 'Order B', due_date: date })).body,
    c = (await alice.post('/api/tasks', { title: 'Order C' })).body
  assert.equal((await alice.post('/api/tasks/reorder', { id: c.id, before_id: a.id })).status, 200)
  const moved = (await alice.get(`/api/tasks/${c.id}`)).body
  assert.equal(moved.due_date, date)
  assert.equal(moved.planned_date, date)
  const rows = (await alice.get('/api/mini/tasks?filter=today')).body.items
  assert.deepEqual(
    rows.map((t) => t.id),
    [b.id, c.id, a.id],
  )
  const action = (await alice.get('/api/history')).body.find((r) => r.label === 'Перенос задачи')
  assert.equal((await alice.post(`/api/history/${action.id}/undo`)).status, 200)
  assert.equal((await alice.get(`/api/tasks/${c.id}`)).body.due_date, null)
})
test('reordering cannot access other owners or leave partially changed rows', async () => {
  const own = (await alice.post('/api/tasks', { title: 'Own', due_date: date })).body,
    other = (await bob.post('/api/tasks', { title: 'Foreign' })).body
  assert.equal((await alice.post('/api/tasks/reorder', { id: own.id, before_id: other.id })).status, 404)
  assert.equal((await alice.post('/api/tasks/reorder', { id: other.id, before_id: own.id })).status, 404)
  assert.equal((await alice.get(`/api/tasks/${own.id}`)).body.due_date, date)
  for (const body of [
    { id: own.id, before_id: own.id },
    { id: -1, before_id: own.id },
    { id: '1', before_id: own.id },
  ])
    assert.equal((await alice.post('/api/tasks/reorder', body)).status, 400)
})
test('swipe deletion returns an exact undo action and restores the original record', async () => {
  const t = (await alice.post('/api/tasks', { title: 'Undo me', due_date: date, focus_date: date, checklist: 'A\nB' })).body
  const result = await alice.del(`/api/tasks/${t.id}`)
  assert.equal(result.status, 200)
  assert.equal(typeof result.body.action_id, 'number')
  assert.equal((await alice.get(`/api/tasks/${t.id}`)).status, 404)
  assert.equal((await bob.post(`/api/history/${result.body.action_id}/undo`)).status, 404)
  assert.equal((await alice.post(`/api/history/${result.body.action_id}/undo`)).status, 200)
  assert.deepEqual((await alice.get(`/api/tasks/${t.id}`)).body, t)
})

test('changing an ordinary task deadline also updates its matching day plan', async () => {
  const task = (await alice.post('/api/tasks', { title: 'Editor reschedule', due_date: date, planned_date: date })).body
  const tomorrow = addDays(date, 1),
    changed = (await alice.patch(`/api/tasks/${task.id}`, { ...task, due_date: tomorrow })).body
  assert.equal(changed.planned_date, tomorrow)
})

test('manual ordering within Today preserves an independently scheduled deadline', async () => {
  const task = (await alice.post('/api/tasks', { title: 'Independent deadline', due_date: addDays(date, 7), focus_date: date })).body
  await alice.patch(`/api/tasks/${task.id}`, { focus_date: null })
  const target = (await alice.post('/api/tasks', { title: 'Today anchor', due_date: date })).body
  assert.equal((await alice.post('/api/tasks/reorder', { id: task.id, before_id: target.id })).status, 200)
  const changed = (await alice.get(`/api/tasks/${task.id}`)).body
  assert.equal(changed.due_date, addDays(date, 7))
  assert.equal(changed.planned_date, date)
})
