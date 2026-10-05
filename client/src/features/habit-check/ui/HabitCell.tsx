import type { CSSProperties, ReactNode } from 'react'
import clsx from 'clsx'
import { format } from 'date-fns'
import { Check, X } from 'lucide-react'
import { useHabitLog, type Habit } from '@/shared/api'
import { todayStr } from '@/shared/lib'
import { habitStart, isScheduled } from '@/entities/habit'

export function HabitCell({ habit, date, logs, size = 'md' }: { habit: Habit; date: string; logs: Map<string, string>; size?: 'sm' | 'md' }) {
  const log = useHabitLog()
  const status = logs.get(`${habit.id}:${date}`)
  const day = new Date(`${date}T12:00`)
  const disabled = date > todayStr() || date < habitStart(habit)
  const scheduled = isScheduled(habit, day)
  const color = habit.color || 'var(--good)'
  const quit = habit.kind === 'quit'

  let style: CSSProperties = {}
  let content: ReactNode = null
  if (quit) {
    if (status === 'slip') {
      style = { background: 'var(--bad)', color: 'white' }
      content = <X size={13} strokeWidth={2.5} />
    } else if (!disabled) style = { background: `color-mix(in srgb, ${color} 20%, var(--surface))` }
  } else if (status === 'done') {
    style = { background: color, color: 'white' }
    content = <Check size={13} strokeWidth={3} />
  }

  const next = quit ? (status === 'slip' ? null : 'slip') : status === 'done' ? null : 'done'
  const state = quit ? (status === 'slip' ? 'срыв' : 'без срыва') : status === 'done' ? 'выполнено' : scheduled ? 'не выполнено' : 'не по плану'
  const title = `${format(day, 'd MMM')}: ${state}`

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={() => log.mutate({ habit_id: habit.id, date, status: next })}
      className={clsx(
        'flex items-center justify-center rounded-[6px] border transition-transform',
        size === 'sm' ? 'h-7 w-7' : 'h-8 w-8',
        disabled ? 'cursor-default border-transparent opacity-30' : 'border-line hover:scale-105 hover:border-line-strong',
        !scheduled && !quit && !status && !disabled && 'border-dashed opacity-50',
        (status || (quit && !disabled)) && 'border-transparent',
      )}
      style={style}
    >
      {content}
    </button>
  )
}
