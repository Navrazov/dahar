import clsx from 'clsx'
import { startOfISOWeek } from 'date-fns'
import { Check, X } from 'lucide-react'
import { useHabitLog, useList, useLoaded, type Habit, type HabitLog } from '@/shared/api'
import { haptic, todayStr, ymd } from '@/shared/lib'
import { LogoMark, Skeleton } from '@/shared/ui'
import { freqText, habitStart, isScheduled } from '@/entities/habit'
import { Rows } from './parts'

export function HabitsTab() {
  const habits = useList('habits')
  const logs = useList('habit_logs')
  const habitsLoaded = useLoaded('habits')
  const logsLoaded = useLoaded('habit_logs')
  const loaded = habitsLoaded && logsLoaded
  const today = todayStr()
  const now = new Date()
  const weekStart = ymd(startOfISOWeek(now))

  const active = habits.filter((h) => !h.archived && habitStart(h) <= today)
  const due = active.filter((h) => h.kind === 'quit' || isScheduled(h, now))
  const status = new Map(logs.filter((l) => l.date === today).map((l) => [l.habit_id, l.status]))
  const doneCount = due.filter((h) => (h.kind === 'quit' ? status.get(h.id) !== 'slip' : status.get(h.id) === 'done')).length

  if (!loaded) {
    return (
      <Rows>
        {[55, 40, 65].map((w) => (
          <div key={w} className="flex items-center gap-3.5 px-4 py-4">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4" style={{ width: `${w}%` }} />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </Rows>
    )
  }

  if (!due.length) {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <LogoMark size={36} />
        <div className="mt-4 text-[16px] font-medium">На сегодня привычек нет</div>
        <div className="mt-1 text-[14px] text-fg-3">Заведите их в приложении Dahar</div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="px-1 text-[13px] font-medium text-fg-3">
        Отмечено {doneCount} из {due.length}
      </div>
      <Rows>
        {due.map((h) => (
          <HabitRow key={h.id} habit={h} status={status.get(h.id)} weekDone={countWeek(logs, h.id, weekStart, today)} />
        ))}
      </Rows>
    </div>
  )
}

const countWeek = (logs: HabitLog[], id: number, from: string, to: string) => logs.filter((l) => l.habit_id === id && l.status === 'done' && l.date >= from && l.date <= to).length

function HabitRow({ habit, status, weekDone }: { habit: Habit; status: string | undefined; weekDone: number }) {
  const log = useHabitLog()
  const quit = habit.kind === 'quit'
  const color = habit.color || 'var(--good)'
  const on = quit ? status === 'slip' : status === 'done'

  const toggle = () => {
    if (quit) haptic.tap()
    else if (!on) haptic.success()
    else haptic.tap()
    log.mutate({ habit_id: habit.id, date: todayStr(), status: on ? null : quit ? 'slip' : 'done' })
  }

  const sub = quit ? (on ? 'Сегодня был срыв' : 'Держусь — нажмите, если сорвались') : habit.frequency === 'weekly' ? `${weekDone} из ${habit.per_week || 1} на этой неделе` : freqText(habit)

  return (
    <button type="button" onClick={toggle} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors active:bg-hover">
      <span
        className={clsx(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-[background-color,border-color,transform] duration-200',
          on ? 'border-transparent text-white animate-[check-in_280ms_var(--ease-out)]' : 'border-line-strong',
        )}
        style={on ? { background: quit ? 'var(--bad)' : color } : quit ? { borderColor: `color-mix(in srgb, ${color} 55%, transparent)` } : undefined}
      >
        {on && (quit ? <X size={18} strokeWidth={2.6} /> : <Check size={18} strokeWidth={3} />)}
      </span>
      <span className="min-w-0 flex-1">
        <span className={clsx('block truncate text-[16px] leading-snug', on && !quit && 'text-fg-2')}>{habit.name}</span>
        <span className={clsx('block truncate text-[13px]', quit && on ? 'text-bad' : 'text-fg-3')}>{sub}</span>
      </span>
    </button>
  )
}
