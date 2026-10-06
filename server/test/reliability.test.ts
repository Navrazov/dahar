import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createUser, login, pool, query, resetDatabase, startApp, type App, type Client } from './helpers.ts'
import { deliver } from '../src/jobs/delivery.ts'
import { parseCalendar, exportCalendar, wallToUtc } from '../src/modules/calendar/ical.ts'

let app: App, user: Client, other: Client, uid: number
before(async () => {
  await resetDatabase()
  app = await startApp()
  uid = await createUser('review')
  await createUser('other')
  user = await login(app.base, 'review')
  other = await login(app.base, 'other')
})
after(async () => {
  await app.close()
  await pool.end()
})
const keyed = async (method: string, path: string, body: unknown, key = randomUUID()) => {
  const r = await fetch(app.base + path, {
    method,
    headers: { cookie: user.cookie!, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  })
  return { status: r.status, body: (await r.json()) as any, action: Number(r.headers.get('X-Dahar-Action')) }
}
const task = async (title: string, data = {}) => (await user.post('/api/tasks', { title, status: 'todo', ...data })).body

test('same mutation replayed concurrently commits exactly once; changed payload is refused', async () => {
  const key = randomUUID()
  const replies = await Promise.all(Array.from({ length: 5 }, () => keyed('POST', '/api/tasks', { title: 'Exactly once' }, key)))
  assert.ok(replies.every((r) => r.status === 201))
  assert.equal(new Set(replies.map((r) => r.body.id)).size, 1)
  assert.equal((await keyed('POST', '/api/tasks', { title: 'Different' }, key)).status, 409)
  assert.equal((await query("SELECT count(*)::int AS n FROM tasks WHERE title='Exactly once'")).rows[0].n, 1)
})
test('undo is private, repeatable, and refuses a newer edit', async () => {
  const created = await keyed('POST', '/api/tasks', { title: 'Original' })
  assert.equal((await other.post(`/api/history/${created.action}/undo`)).status, 404)
  const edit = await keyed('PATCH', `/api/tasks/${created.body.id}`, { title: 'Edit' })
  assert.equal((await user.post(`/api/history/${created.action}/undo`)).status, 409)
  assert.equal((await user.post(`/api/history/${edit.action}/undo`)).status, 200)
  assert.equal((await user.get(`/api/tasks/${created.body.id}`)).body.title, 'Original')
  assert.equal((await user.post(`/api/history/${edit.action}/undo`)).status, 200)
  assert.equal((await user.post(`/api/history/${created.action}/undo`)).status, 200)
  assert.equal((await user.get(`/api/tasks/${created.body.id}`)).status, 404)
})
test('undo refuses to cascade into dependent records added later', async () => {
  const p = await keyed('POST', '/api/projects', { name: 'Keep my child' })
  const t = await task('New child', { project_id: p.body.id })
  assert.equal((await user.post(`/api/history/${p.action}/undo`)).status, 409)
  assert.equal((await user.get(`/api/tasks/${t.id}`)).body.project_id, p.body.id)
})
test('sale edits remain consistent under concurrency, and stock is restored by undo', async () => {
  const p = (await user.post('/api/products', { name: 'Stock', stock: 100 })).body
  const sale = (await user.post('/api/sales', { date: '2026-10-01', product_id: p.id, quantity: 1, amount: 10 })).body
  await Promise.all([2, 3, 4, 5, 6].map((quantity) => user.patch(`/api/sales/${sale.id}`, { quantity })))
  const current = (await user.get(`/api/sales/${sale.id}`)).body
  assert.equal((await user.get(`/api/products/${p.id}`)).body.stock, 100 - current.quantity)
  const change = await keyed('PATCH', `/api/sales/${sale.id}`, { quantity: 10 })
  assert.equal((await user.post(`/api/history/${change.action}/undo`)).status, 200)
  assert.equal((await user.get(`/api/products/${p.id}`)).body.stock, 100 - current.quantity)
})
test('undo restores a deleted parent with its cascade and set-null relationships', async () => {
  const p = (await user.post('/api/partners', { name: 'Parent' })).body
  const report = (await user.post('/api/partner_reports', { partner_id: p.id, date: '2026-10-01', applications: 2 })).body
  const t = await task('Linked task', { partner_id: p.id })
  const removal = await keyed('DELETE', `/api/partners/${p.id}`, {})
  assert.equal(removal.status, 200)
  assert.equal((await user.post(`/api/history/${removal.action}/undo`)).status, 200)
  assert.equal((await user.get(`/api/partner_reports/${report.id}`)).body.partner_id, p.id)
  assert.equal((await user.get(`/api/tasks/${t.id}`)).body.partner_id, p.id)
})
test('same-account transfers are rejected on creation and update', async () => {
  const a = (await user.post('/api/accounts', { name: 'Wallet', initial_balance: 100 })).body
  assert.equal((await user.post('/api/transactions', { kind: 'transfer', date: '2026-10-01', amount: 10, account_id: a.id, to_account_id: a.id })).status, 400)
  const b = (await user.post('/api/accounts', { name: 'Bank' })).body
  const tr = (await user.post('/api/transactions', { kind: 'transfer', date: '2026-10-01', amount: 10, account_id: a.id, to_account_id: b.id })).body
  assert.equal((await user.patch(`/api/transactions/${tr.id}`, { to_account_id: a.id })).status, 400)
})
test('focus limit is atomic, including when completed tasks are reopened', async () => {
  const rows = await Promise.all(
    Array.from({ length: 5 }, (_, i) => user.post('/api/tasks', { title: `Focus ${i}`, focus_date: '2026-10-05', status: 'todo' })),
  )
  assert.equal(rows.filter((r) => r.status === 201).length, 3)
  const done = await task('Done focus', { focus_date: '2026-10-05', status: 'done' })
  assert.equal((await user.patch(`/api/tasks/${done.id}`, { status: 'todo' })).status, 400)
})
test('bulk task changes roll back entirely when one ID is not owned; one action undoes the batch', async () => {
  const a = await task('Bulk A'),
    b = await task('Bulk B')
  const foreign = (await other.post('/api/tasks', { title: 'Other' })).body
  assert.equal((await user.post('/api/tasks/bulk', { ids: [a.id, foreign.id], data: { status: 'done' } })).status, 404)
  assert.equal((await user.get(`/api/tasks/${a.id}`)).body.status, 'todo')
  const r = await keyed('POST', '/api/tasks/bulk', { ids: [a.id, b.id], data: { status: 'done' } })
  assert.equal(r.status, 200)
  assert.equal((await user.post(`/api/history/${r.action}/undo`)).status, 200)
  assert.equal((await user.get(`/api/tasks/${b.id}`)).body.status, 'todo')
})
test('backup validation refuses partial files and invalid references before any deletion', async () => {
  const before = (await user.get('/api/tasks')).body.length
  assert.equal((await user.post('/api/restore', { data: {}, confirm: 'replace' })).status, 400)
  const backup = (await user.get('/api/backup')).body
  backup.data.tasks[0].project_id = 2147483647
  assert.equal((await user.post('/api/restore/preview', backup)).status, 400)
  assert.equal((await user.post('/api/restore', { ...backup, confirm: 'replace' })).status, 400)
  assert.equal((await user.get('/api/tasks')).body.length, before)
})
test('restore keeps deduplication fingerprints and category rules; a private automatic checkpoint recovers previous data', async () => {
  const account = (await user.post('/api/accounts', { name: 'Statement account' })).body
  const csv = 'Дата;Сумма;Описание\n01.10.2026;-50;Coffee\n'
  const data = Buffer.from(csv).toString('base64')
  const preview = (await user.post('/api/finance/import/preview', { account_id: account.id, data })).body
  assert.equal(
    (
      await user.post('/api/finance/import', {
        confirm_currency: true,
        account_id: account.id,
        rows: preview.rows.map((r: any) => ({ ...r, learn: true, category: 'Coffee learned' })),
      })
    ).status,
    200,
  )
  const insight = { summary: 'Week', wins: ['Done'], attention: [], money: 'No money', habits: 'Reading', next_week: ['Plan'] }
  await query("INSERT INTO weekly_insights(user_id,week_start,content,model) VALUES($1,'2026-09-28',$2,'test')", [uid, JSON.stringify(insight)])
  const backup = (await user.get('/api/backup')).body
  assert.equal(backup.insights.length, 1)
  const marker = await task('After backup')
  assert.equal((await user.post('/api/restore', backup)).status, 400, 'explicit confirmation required')
  assert.equal((await user.post('/api/restore', { ...backup, confirm: 'replace' })).status, 200)
  const restored = (await user.get('/api/accounts')).body.find((a: any) => a.name === 'Statement account')
  assert.notEqual(restored.id, account.id)
  assert.deepEqual((await query("SELECT content FROM weekly_insights WHERE user_id=$1 AND week_start='2026-09-28'", [uid])).rows[0].content, insight)
  const again = (await user.post('/api/finance/import/preview', { account_id: restored.id, data })).body
  assert.ok(again.rows.every((r: any) => r.duplicate))
  assert.equal(again.rows[0].category, 'Coffee learned')
  const checkpoint = (await user.get('/api/backup/checkpoints')).body[0]
  assert.equal((await other.post(`/api/backup/checkpoints/${checkpoint.id}/restore`, { confirm: 'replace' })).status, 404)
  assert.equal((await user.post(`/api/backup/checkpoints/${checkpoint.id}/restore`, { confirm: 'replace' })).status, 200)
  assert.ok((await user.get('/api/tasks')).body.some((t: any) => t.title === marker.title))
})
test('delivery failures retry later without duplicating successful channels', async () => {
  const at = new Date('2026-10-05T05:00:00Z')
  let tg = 0,
    push = 0
  assert.equal(
    await deliver(uid, 'retry-test', 'telegram', at, async () => {
      tg++
      return true
    }),
    true,
  )
  assert.equal(
    await deliver(uid, 'retry-test', 'push', at, async () => {
      push++
      return false
    }),
    false,
  )
  assert.equal(
    await deliver(uid, 'retry-test', 'push', at, async () => {
      push++
      return true
    }),
    false,
  )
  const later = new Date(at.getTime() + 61000)
  assert.equal(
    await deliver(uid, 'retry-test', 'telegram', later, async () => {
      tg++
      return true
    }),
    true,
  )
  assert.equal(
    await deliver(uid, 'retry-test', 'push', later, async () => {
      push++
      return true
    }),
    true,
  )
  assert.equal(tg, 1)
  assert.equal(push, 2)
})
test('currency changes including null reset are blocked once amounts exist', async () => {
  assert.equal((await user.put('/api/settings/currency', { value: '€' })).status, 400)
  assert.equal((await other.put('/api/settings/currency', { value: '€' })).status, 200)
  await other.post('/api/accounts', { name: 'Euro wallet' })
  assert.equal((await other.put('/api/settings/currency', { value: null })).status, 400)
  assert.equal((await other.put('/api/settings/currency', { value: '€' })).status, 200)
})
test('goal aggregates use the specified project and closed period', async () => {
  const p = (await user.post('/api/projects', { name: 'Goal scope' })).body
  await task('Inside', { project_id: p.id, status: 'done', completed_at: '2026-09-10T10:00' })
  await task('Outside month', { project_id: p.id, status: 'done', completed_at: '2026-10-10T10:00' })
  await task('Outside project', { status: 'done', completed_at: '2026-09-10T10:00' })
  const g = (
    await user.post('/api/goals', {
      title: 'September',
      metric: 'project_tasks_done',
      project_id: p.id,
      period_start: '2026-09-01',
      period_end: '2026-09-30',
      target_value: 2,
    })
  ).body
  const values = await user.get('/api/goal-values')
  assert.equal(values.status, 200)
  assert.equal(values.body[g.id], 1)
  assert.equal((await user.patch(`/api/goals/${g.id}`, { period_end: '2026-08-01' })).status, 400)
})
test('cursor pagination visits all records once with filters preserved', async () => {
  await query("INSERT INTO tasks(user_id,title,status) SELECT $1,'Page ' || n,'todo' FROM generate_series(1,510) n", [uid])
  const first = (await user.get('/api/tasks?status=todo&limit=500')).body
  assert.equal(first.length, 500)
  const rest = (await user.get(`/api/tasks?status=todo&limit=500&before=${first.at(-1).id}`)).body
  const ids = [...first, ...rest].map((r: any) => r.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.length > 510)
})
test('activation records first milestones once without storing record contents', async () => {
  await user.post('/api/activation', { event: 'weekly_review_opened' })
  await user.post('/api/activation', { event: 'weekly_review_opened' })
  assert.equal((await user.post('/api/activation', { event: 'arbitrary' })).status, 400)
  assert.equal((await query("SELECT count(*)::int AS n FROM product_events WHERE user_id=$1 AND event='weekly_review_opened'", [uid])).rows[0].n, 1)
  assert.ok((await query('SELECT event FROM product_events WHERE user_id=$1', [uid])).rows.some((r) => r.event === 'first_task'))
})
const ics = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\n${body}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`
test('ICS roundtrip preserves Cyrillic, escaped descriptions, timezone and exclusive all-day end', () => {
  const events = parseCalendar(
    ics('UID:one\r\nSUMMARY:Встреча\\, план\r\nDESCRIPTION:Строка\\nДалее\r\nDTSTART:20261005T090000Z\r\nDTEND:20261005T100000Z'),
    'Europe/Moscow',
  )
  assert.equal(events[0].start, '2026-10-05T12:00')
  assert.equal(events[0].title, 'Встреча, план')
  const output = exportCalendar(
    events.map((e, i) => ({ ...e, id: i + 1 })),
    'Europe/Moscow',
  )
  assert.deepEqual(parseCalendar(output, 'Europe/Moscow'), events)
  const day = parseCalendar(ics('UID:day\r\nSUMMARY:Отпуск\r\nDTSTART;VALUE=DATE:20261005\r\nDTEND;VALUE=DATE:20261007'), 'Europe/Moscow')[0]
  assert.equal(day.end, '2026-10-06T00:00')
  assert.deepEqual(parseCalendar(exportCalendar([{ ...day, id: 1 }], 'Europe/Moscow'), 'Europe/Moscow'), [day])
})
test('ICS supports folded UTF-8 and TZID but rejects recurrence, invalid dates and nonexistent DST times', () => {
  assert.equal(
    parseCalendar(ics('UID:fold\r\nSUMMARY:Название\r\n продолжение\r\nDTSTART;TZID=Europe/Berlin:20261005T100000'), 'Europe/Moscow')[0].start,
    '2026-10-05T11:00',
  )
  assert.throws(() => parseCalendar(ics('UID:r\r\nDTSTART:20261005T100000\r\nRRULE:FREQ=DAILY'), 'Europe/Moscow'))
  assert.throws(() => parseCalendar(ics('UID:r\r\nDTSTART:20260230T100000'), 'Europe/Moscow'))
  assert.throws(() => wallToUtc('2026-03-29T02:30', 'Europe/Berlin'))
})
test('calendar import updates by UID, stays private, and can be undone as one action', async () => {
  const data = ics('UID:calendar-test\r\nSUMMARY:Imported meeting\r\nDTSTART:20261005T090000Z')
  const first = await keyed('POST', '/api/calendar/import', { data })
  assert.equal(first.status, 200)
  assert.equal(first.body.created, 1)
  assert.equal((await user.post('/api/calendar/import', { data })).body.updated, 1)
  assert.equal((await other.get('/api/events')).body.length, 0)
  assert.equal((await user.get('/api/calendar/export')).status, 200)
  const latest = (await user.get('/api/history')).body[0]
  assert.equal((await user.post(`/api/history/${latest.id}/undo`)).status, 200)
  assert.equal((await user.post(`/api/history/${first.action}/undo`)).status, 200)
  assert.ok(!(await user.get('/api/events')).body.some((e: any) => e.external_uid === 'calendar-test'))
})

test('a queued mutation cannot enter a different user account after another tab signs in', async () => {
  const response = await fetch(app.base + '/api/tasks', {
    method: 'POST',
    headers: { cookie: other.cookie!, 'Content-Type': 'application/json', 'X-Dahar-User': String(uid) },
    body: JSON.stringify({ title: 'Wrong owner' }),
  })
  assert.equal(response.status, 401)
  assert.ok(!(await other.get('/api/tasks')).body.some((t: any) => t.title === 'Wrong owner'))
})

test('replayed restore keeps IDs and creates only one checkpoint', async () => {
  const backup = (await user.get('/api/backup')).body
  const key = randomUUID()
  const body = { ...backup, confirm: 'replace' }
  const countBefore = (await user.get('/api/backup/checkpoints')).body.length
  assert.equal((await keyed('POST', '/api/restore', body, key)).status, 200)
  const firstIds = (await user.get('/api/tasks?limit=5000')).body.map((t: any) => t.id)
  assert.equal((await keyed('POST', '/api/restore', body, key)).status, 200)
  assert.deepEqual(
    (await user.get('/api/tasks?limit=5000')).body.map((t: any) => t.id),
    firstIds,
  )
  assert.equal((await user.get('/api/backup/checkpoints')).body.length, Math.min(10, countBefore + 1))
})

test('undo does not relabel amounts created after a currency change', async () => {
  const freshId = await createUser('currency-undo')
  const fresh = await login(app.base, 'currency-undo')
  const changed = await fetch(app.base + '/api/settings/currency', {
    method: 'PUT',
    headers: { cookie: fresh.cookie!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: '€' }),
  })
  const action = changed.headers.get('X-Dahar-Action')
  assert.equal(changed.status, 200)
  await fresh.post('/api/accounts', { name: 'Euro amounts', initial_balance: 100 })
  assert.equal((await fresh.post(`/api/history/${action}/undo`)).status, 409)
  assert.equal((await fresh.get('/api/settings')).body.currency, '€')
  assert.ok(freshId > 0)
})

test('direct service writes used by the bot are included in undo history', async () => {
  const { createRecord } = await import('../src/modules/records/records.service.ts')
  const created = await createRecord('tasks', { title: 'From bot service' }, uid)
  const action = (await user.get('/api/history')).body[0]
  assert.equal(action.label, 'Создание: Задача')
  assert.equal((await user.post(`/api/history/${action.id}/undo`)).status, 200)
  assert.equal((await user.get(`/api/tasks/${created.id}`)).status, 404)
})
