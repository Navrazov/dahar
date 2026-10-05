import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { row } from '@/shared/testing'
import { freqText, habitStats } from './stats'

const log = (habit_id: number, date: string, status: 'done' | 'slip' = 'done') => row('habit_logs', { habit_id, date, status })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-07T12:00:00')) // среда
})
afterEach(() => vi.useRealTimers())

describe('habitStats: daily habit', () => {
  const h = row('habits', { name: 'Читать', kind: 'build', frequency: 'daily', start_date: '2026-10-01' })

  it('counts the current streak and does not break it for an unchecked today', () => {
    const logs = ['2026-10-04', '2026-10-05', '2026-10-06'].map((d) => log(h.id, d))
    const s = habitStats(h, logs)
    expect(s.streak).toBe(3)
    expect(s.doneToday).toBe(false)
    expect(s.streakUnit).toBe('дн')
  })

  it('a missed day in the past resets the streak, best keeps the record', () => {
    const logs = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-07'].map((d) => log(h.id, d))
    const s = habitStats(h, logs)
    expect(s.streak).toBe(1)
    expect(s.best).toBe(3)
    expect(s.doneToday).toBe(true)
  })

  it('ignores other habits’ logs', () => {
    expect(habitStats(h, [log(h.id + 1, '2026-10-06')]).streak).toBe(0)
  })
})

describe('habitStats: quit habit', () => {
  const h = row('habits', { name: 'Не курить', kind: 'quit', start_date: '2026-10-01' })

  it('missing checks never count as success', () => {
    const s = habitStats(h, [log(h.id, '2026-10-03', 'slip')])
    expect(s.streak).toBe(0)
    expect(s.doneToday).toBe(false)
  })
  it('counts confirmed clean days', () => {
    const s = habitStats(
      h,
      ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'].map((d) => log(h.id, d)),
    )
    expect(s.streak).toBe(4)
    expect(s.doneToday).toBe(true)
  })
})

describe('habitStats: N times a week', () => {
  const h = row('habits', { name: 'Спорт', kind: 'build', frequency: 'weekly', per_week: 2, start_date: '2026-09-21' })

  it('measures streak in weeks and keeps the current week open', () => {
    const logs = ['2026-09-22', '2026-09-24', '2026-09-29', '2026-10-01', '2026-10-06'].map((d) => log(h.id, d))
    const s = habitStats(h, logs)
    expect(s.streakUnit).toBe('нед')
    expect(s.streak).toBe(2)
    expect(s.weekCount).toBe(1)
    expect(s.rate7).toBe(0.5)
  })
})

describe('freqText', () => {
  it('describes the schedule', () => {
    expect(freqText(row('habits', { kind: 'build', frequency: 'weekdays', days: [1, 3, 5] }))).toBe('Пн, Ср, Пт')
    expect(freqText(row('habits', { kind: 'build', frequency: 'weekly', per_week: 3 }))).toBe('3 раз в неделю')
    expect(freqText(row('habits', { kind: 'quit' }))).toBe('Каждый день без срыва')
  })
})
