import { addDays, addMonths, weekday } from './time.ts'

export interface Repeatable {
  repeat?: string | null
  repeat_days?: number[] | null
  repeat_interval?: number | null
  due_date?: string | null
}

type Step = (d: string) => string

function stepper(task: Repeatable, base: string): Step | null {
  switch (task.repeat) {
    case 'daily':
      return (d: string) => addDays(d, 1)
    case 'weekdays':
      return (d: string) => {
        let n = addDays(d, 1)
        while (weekday(n) > 5) n = addDays(n, 1)
        return n
      }
    case 'weekly': {
      const days = Array.isArray(task.repeat_days) && task.repeat_days.length ? task.repeat_days : [weekday(base)]
      return (d: string) => {
        let n = addDays(d, 1)
        for (let i = 0; i < 7 && !days.includes(weekday(n)); i++) n = addDays(n, 1)
        return n
      }
    }
    case 'interval':
      return (d: string) => addDays(d, Math.max(1, task.repeat_interval || 1))
    default:
      return null
  }
}

export function nextDueDate(task: Repeatable, today: string): string | null {
  if (!task.repeat) return null
  const base = task.due_date || today

  if (task.repeat === 'monthly' || task.repeat === 'yearly') {
    const months = task.repeat === 'monthly' ? 1 : 12
    let k = 1
    while (addMonths(base, k * months) <= today && k < 1200) k++
    return addMonths(base, k * months)
  }

  const step = stepper(task, base)
  if (!step) return null
  let next = step(base)
  for (let i = 0; next <= today && i < 5000; i++) next = step(next)
  return next
}
