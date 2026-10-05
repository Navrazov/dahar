import { describe, expect, it } from 'vitest'
import { row } from '@/shared/testing'
import { sortTasks } from './sort'

describe('sortTasks', () => {
  it('puts open tasks first, then by due date, then by priority', () => {
    const done = row('tasks', { title: 'done', status: 'done', due_date: '2026-01-01' })
    const later = row('tasks', { title: 'later', status: 'todo', due_date: '2026-03-01' })
    const soonLow = row('tasks', { title: 'soon-low', status: 'todo', due_date: '2026-02-01', priority: 'low' })
    const soonUrgent = row('tasks', { title: 'soon-urgent', status: 'in_progress', due_date: '2026-02-01', priority: 'urgent' })
    const undated = row('tasks', { title: 'undated', status: 'todo' })

    expect(sortTasks([done, undated, later, soonLow, soonUrgent]).map((t) => t.title)).toEqual(['soon-urgent', 'soon-low', 'later', 'undated', 'done'])
  })

  it('does not mutate the input', () => {
    const list = [row('tasks', { title: 'b', due_date: '2026-02-01' }), row('tasks', { title: 'a', due_date: '2026-01-01' })]
    sortTasks(list)
    expect(list[0].title).toBe('b')
  })
})
