import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useEditor } from '@/features/edit-record'
import { accountNow } from '@/shared/lib'
import clsx from 'clsx'
import { startOfISOWeek } from 'date-fns'
import { Check, X, Pencil } from 'lucide-react'
import { useHabitLog, useList, useListWhere, useLoaded, useSave, type Habit, type HabitLog } from '@/shared/api'
import { haptic, todayStr, ymd } from '@/shared/lib'
import { LogoMark, Skeleton } from '@/shared/ui'
import { freqText, habitStart, isScheduled } from '@/entities/habit'
import { Rows } from './parts'

export function HabitsTab() {
  const habits = useList('habits')
  const habitsLoaded = useLoaded('habits')
  const loaded = habitsLoaded
  const today = todayStr()
  const now = accountNow()
  const weekStart = ymd(startOfISOWeek(now))
  const logs = useListWhere('habit_logs', { from: weekStart, to: today })

  const active = habits.filter((h) => !h.archived && habitStart(h) <= today)
  const due = active.filter((h) => h.kind === 'quit' || isScheduled(h, now))
  const status = new Map(logs.filter((l) => l.date === today).map((l) => [l.habit_id, l.status]))
  const doneCount = due.filter((h) => status.get(h.id) === 'done').length

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
      <div>
        <QuickHabit />
        <div className="flex flex-col items-center py-12 text-center">
          <LogoMark size={36} />
          <div className="mt-4 text-[16px] font-medium">На сегодня привычек нет</div>
          <div className="mt-1 text-[14px] text-fg-3">Добавь привычку здесь или настрой расписание</div>
        </div>
        <Link to="/habits/manage" className="block min-h-11 text-center text-sm text-accent">
          Все привычки и расписание →
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <QuickHabit />
      <div className="px-1 text-[13px] font-medium text-fg-3">
        Отмечено {doneCount} из {due.length}
      </div>
      <Rows>
        {due.map((h) => (
          <HabitRow key={h.id} habit={h} status={status.get(h.id)} weekDone={countWeek(logs, h.id, weekStart, today)} />
        ))}
      </Rows>
      <Link to="/habits/manage" className="block min-h-11 py-3 text-center text-sm text-accent">
        Все привычки и расписание →
      </Link>
    </div>
  )
}

const countWeek = (logs: HabitLog[], id: number, from: string, to: string) =>
  logs.filter((l) => l.habit_id === id && l.status === 'done' && l.date >= from && l.date <= to).length

function HabitRow({ habit, status, weekDone }: { habit: Habit; status: string | undefined; weekDone: number }) {
  const log = useHabitLog()
  const edit = useEditor()
  const quit = habit.kind === 'quit'
  const color = habit.color || 'var(--good)'
  const on = status === 'slip' || status === 'done'

  const toggle = () => {
    if (quit) haptic.tap()
    else if (!on) haptic.success()
    else haptic.tap()
    log.mutate({ habit_id: habit.id, date: todayStr(), status: quit ? (status === 'done' ? 'slip' : status === 'slip' ? null : 'done') : on ? null : 'done' })
  }

  const sub = quit
    ? status === 'slip'
      ? 'Срыв — нажмите, чтобы снять отметку'
      : status === 'done'
        ? 'Держусь — нажмите, если сорвались'
        : 'Нет отметки — нажмите, если держитесь'
    : habit.frequency === 'weekly'
      ? `${weekDone} из ${habit.per_week || 1} на этой неделе`
      : freqText(habit)

  return (
    <div className="flex items-center">
      <button
        type="button"
        disabled={log.isPending || !navigator.onLine}
        aria-label={`${habit.name}: ${sub}`}
        onClick={toggle}
        className="flex min-w-0 flex-1 items-center gap-3.5 px-4 py-3.5 text-left transition-colors active:bg-hover"
      >
        <span
          className={clsx(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-[background-color,border-color,transform] duration-200',
            on ? 'border-transparent text-white animate-[check-in_280ms_var(--ease-out)]' : 'border-line-strong',
          )}
          style={
            on ? { background: status === 'slip' ? 'var(--bad)' : color } : quit ? { borderColor: `color-mix(in srgb, ${color} 55%, transparent)` } : undefined
          }
        >
          {on && (status === 'slip' ? <X size={18} strokeWidth={2.6} /> : <Check size={18} strokeWidth={3} />)}
        </span>
        <span className="min-w-0 flex-1">
          <span className={clsx('block truncate text-[16px] leading-snug', on && !quit && 'text-fg-2')}>{habit.name}</span>
          <span className={clsx('block truncate text-[13px]', status === 'slip' ? 'text-bad' : 'text-fg-3')}>{sub}</span>
        </span>
      </button>
      <button
        type="button"
        aria-label={`Изменить привычку ${habit.name}`}
        onClick={() => edit('habits', habit)}
        className="mr-2 flex h-11 w-11 shrink-0 items-center justify-center text-fg-3"
      >
        <Pencil size={17} />
      </button>
    </div>
  )
}

function QuickHabit() {
  const [name, setName] = useState(''),
    save = useSave('habits')
  return (
    <form
      aria-label="Добавить привычку"
      className="mb-4 flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim() || save.isPending) return
        try {
          await save.mutateAsync({ name: name.trim(), kind: 'build', frequency: 'daily', start_date: todayStr(), color: '#5b9c65' })
          setName('')
        } catch {
          /* keep the input on failure */
        }
      }}
    >
      <input
        aria-label="Название привычки"
        maxLength={200}
        className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-base"
        placeholder="Новая привычка"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        className="min-h-11 rounded-xl bg-accent px-3 text-sm text-white disabled:opacity-40"
        disabled={!name.trim() || save.isPending || !navigator.onLine}
      >
        Добавить
      </button>
    </form>
  )
}
