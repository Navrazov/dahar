import { describe, expect, it } from 'vitest'
import { row } from '@/shared/testing'
import { projectProgress } from './progress'

const p = row('projects', { name: 'P', status: 'active' })
const none = () => 0

describe('projectProgress', () => {
  it('uses the manual value when set, clamped to 0..100', () => {
    expect(projectProgress({ ...p, progress: 40 }, [], [], none)).toBe(0.4)
    expect(projectProgress({ ...p, progress: 140 }, [], [], none)).toBe(1)
  })

  it('a finished project is complete', () => {
    expect(projectProgress({ ...p, status: 'done' }, [], [], none)).toBe(1)
  })

  it('averages task completion and goal progress, ignoring dropped goals and other projects', () => {
    const tasks = [
      row('tasks', { project_id: p.id, status: 'done' }),
      row('tasks', { project_id: p.id, status: 'todo' }),
      row('tasks', { project_id: 999, status: 'done' }),
    ]
    const goals = [row('goals', { project_id: p.id, status: 'active' }), row('goals', { project_id: p.id, status: 'dropped' })]
    // задачи 1/2 = 0.5, цели: одна активная с прогрессом 0.9 → (0.5 + 0.9) / 2
    expect(projectProgress(p, tasks, goals, () => 0.9)).toBeCloseTo(0.7)
  })

  it('is zero with nothing to measure', () => {
    expect(projectProgress(p, [], [], none)).toBe(0)
  })
})
