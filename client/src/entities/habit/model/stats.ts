import { accountNow } from '@/shared/lib'
import { eachDayOfInterval, getISODay, startOfISOWeek, subDays } from 'date-fns'
import type { Habit, HabitLog } from '@/shared/api'
import { label, parse, sum, todayStr, WEEKDAY_SHORT, ymd } from '@/shared/lib'
import { habitFrequencies } from './options'

export function habitStart(h: Habit): string {
  return h.start_date || h.created_at.slice(0, 10)
}

export function isScheduled(h: Habit, d: Date): boolean {
  if (h.frequency === 'weekdays') return (h.days || []).includes(getISODay(d))
  return true
}

export function freqText(h: Habit) {
  if (h.kind === 'quit') return 'Каждый день без срыва'
  if (h.frequency === 'weekly') return `${h.per_week || 1} раз в неделю`
  if (h.frequency === 'weekdays') return (h.days || []).map((d) => WEEKDAY_SHORT[d - 1]).join(', ') || 'Дни не выбраны'
  return label(habitFrequencies, h.frequency)
}

export interface HabitStats {
  rate: number
  rate7: number
  rate30: number
  streak: number
  best: number
  streakUnit: 'дн' | 'нед'
  doneToday: boolean
  weekCount: number
}

function weeklyStats(h: Habit, days: Date[], ok: (d: Date) => boolean, doneToday: boolean): HabitStats {
  const target = Math.max(1, h.per_week || 1)
  const weeks = new Map<string, number>()
  for (const d of days) {
    const k = ymd(startOfISOWeek(d))
    weeks.set(k, (weeks.get(k) || 0) + (ok(d) ? 1 : 0))
  }
  const entries = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b))
  const thisWeek = ymd(startOfISOWeek(accountNow()))
  const success = (n: number) => n >= target

  let streak = 0
  for (let i = entries.length - 1; i >= 0; i--) {
    const [k, n] = entries[i]
    if (success(n)) streak++
    else if (k !== thisWeek) break
  }
  let best = 0
  let run = 0
  for (const [, n] of entries) {
    run = success(n) ? run + 1 : 0
    best = Math.max(best, run)
  }
  const ratio = (ws: [string, number][]) => (ws.length ? sum(ws.map(([, n]) => Math.min(1, n / target))) / ws.length : 0)
  return {
    rate: ratio(entries),
    rate7: Math.min(1, (weeks.get(thisWeek) || 0) / target),
    rate30: ratio(entries.slice(-4)),
    streak,
    best,
    streakUnit: 'нед',
    doneToday,
    weekCount: weeks.get(thisWeek) || 0,
  }
}

export function habitStats(h: Habit, logs: HabitLog[]): HabitStats {
  const mine = new Map(logs.filter((l) => l.habit_id === h.id).map((l) => [l.date, l.status]))
  const start = parse(habitStart(h)) ?? accountNow()
  const today = accountNow()
  const days = start > today ? [] : eachDayOfInterval({ start, end: today })
  const quit = h.kind === 'quit'
  const ok = (d: Date) => mine.get(ymd(d)) === 'done'
  const doneToday = mine.get(todayStr()) === 'done'

  if (h.frequency === 'weekly' && !quit) return weeklyStats(h, days, ok, doneToday)

  const scheduled = days.filter((d) => quit || isScheduled(h, d))
  const rateOf = (ds: Date[]) => {
    const counted = ds.filter((d) => ymd(d) !== todayStr() || ok(d))
    return counted.length ? counted.filter(ok).length / counted.length : 0
  }
  let streak = 0
  for (let i = scheduled.length - 1; i >= 0; i--) {
    if (ok(scheduled[i])) streak++
    else if (ymd(scheduled[i]) !== todayStr()) break
  }
  let best = 0
  let run = 0
  for (const d of scheduled) {
    run = ok(d) ? run + 1 : 0
    best = Math.max(best, run)
  }
  const since = (n: number) => scheduled.filter((d) => d > subDays(today, n))
  return {
    rate: rateOf(scheduled),
    rate7: rateOf(since(7)),
    rate30: rateOf(since(30)),
    streak,
    best,
    streakUnit: 'дн',
    doneToday,
    weekCount: 0,
  }
}
