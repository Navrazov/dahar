import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createUser, login, pool, resetDatabase, startApp, type App, type Client } from './helpers.ts'
import type { WeekData } from '../src/modules/insights/week-data.ts'
import type { WeeklyInsight } from '../src/modules/insights/insights.service.ts'

let app: App, user: Client, other: Client
const seen: WeekData[] = []

const fake = async (week: WeekData): Promise<WeeklyInsight> => {
  seen.push(week)
  return { summary: 'Хорошая неделя', wins: ['Сдал отчёт'], attention: [], money: 'Траты в норме', habits: 'Ровно', next_week: ['a', 'b', 'c'] }
}

const WEEK = '2026-09-28'

before(async () => {
  await resetDatabase()
  app = await startApp({ generateInsight: fake })
  await createUser('ins')
  await createUser('nosy')
  user = await login(app.base, 'ins')
  other = await login(app.base, 'nosy')
})

after(async () => {
  await app.close()
  await pool.end()
})

test('an empty week is not sent to the model', async () => {
  const r = await user.post('/api/insights', { week: WEEK })
  assert.equal(r.status, 400)
  assert.equal(seen.length, 0)
})

test('the week is summarized from the right data and stored', async () => {
  const p = (await user.post('/api/projects', { name: 'Ремонт', status: 'active' })).body
  const t = (await user.post('/api/tasks', { title: 'Сдать отчёт', due_date: '2026-09-29', project_id: p.id })).body
  await user.patch(`/api/tasks/${t.id}`, { status: 'done', completed_at: '2026-09-30T10:00' })
  await user.post('/api/tasks', { title: 'Позвонить в банк', due_date: '2026-09-20' })
  await user.post('/api/transactions', { date: '2026-09-29', kind: 'expense', amount: 1500, category: 'Кафе' })
  await user.post('/api/transactions', { date: '2026-09-22', kind: 'expense', amount: 500, category: 'Кафе' })
  await user.post('/api/transactions', { date: '2026-10-05', kind: 'expense', amount: 9999, category: 'Не эта неделя' })

  const r = await user.post('/api/insights', { week: WEEK })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.equal(r.body.summary, 'Хорошая неделя')

  const week = seen.at(-1)!
  assert.deepEqual(week.week, { start: '2026-09-28', end: '2026-10-04' })
  assert.deepEqual(week.tasks.done, ['Сдать отчёт'])
  assert.deepEqual(week.tasks.overdue, ['Позвонить в банк'])
  assert.equal(week.money.expense, 1500)
  assert.equal(week.money.previous_expense, 500)
  assert.deepEqual(week.money.top_expenses, [{ category: 'Кафе', amount: 1500, previous: 500 }])
  assert.deepEqual(week.projects, [{ name: 'Ремонт', status: 'active', tasks_done_this_week: 1, open_tasks: 0 }])

  const stored = (await user.get(`/api/insights?week=${WEEK}`)).body
  assert.equal(stored.enabled, true)
  assert.equal(stored.insight.summary, 'Хорошая неделя')
})

test('insights are private and the week must be a Monday', async () => {
  assert.equal((await other.get(`/api/insights?week=${WEEK}`)).body.insight, null)
  assert.equal((await user.get('/api/insights?week=2026-09-29')).status, 400)
})
