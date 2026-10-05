import { useState } from 'react'
import clsx from 'clsx'
import { ArrowUp, ChevronDown } from 'lucide-react'
import { useList, useLoaded, useSave, type Task } from '@/shared/api'
import { haptic, relDate, todayStr } from '@/shared/lib'
import { Checkbox, LogoMark, Skeleton } from '@/shared/ui'
import { Group, Rows } from './parts'

const byTime = (a: Task, b: Task) => (a.due_date || '').localeCompare(b.due_date || '') || (a.due_time || '99').localeCompare(b.due_time || '99') || a.id - b.id

export function TodayTab() {
  const tasks = useList('tasks')
  const loaded = useLoaded('tasks')
  const save = useSave('tasks')
  const today = todayStr()
  const [title, setTitle] = useState('')
  const [showDone, setShowDone] = useState(false)

  const open = tasks.filter((t) => t.status !== 'done' && t.due_date && t.due_date <= today).sort(byTime)
  const overdue = open.filter((t) => t.due_date! < today)
  const now = open.filter((t) => t.due_date === today)
  const done = tasks.filter((t) => t.status === 'done' && t.completed_at?.slice(0, 10) === today)

  const add = async () => {
    const text = title.trim()
    if (!text) return
    haptic.tap()
    try {
      await save.mutateAsync({ title: text[0].toUpperCase() + text.slice(1), due_date: today, status: 'todo', priority: 'medium' })
      setTitle('')
    } catch {}
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        className="flex items-center gap-2 rounded-[14px] border border-line bg-surface py-1.5 pr-1.5 pl-4 transition-[border-color,box-shadow] focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/15"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Новая задача на сегодня"
          enterKeyHint="done"
          className="h-9 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-fg-3"
        />
        <button
          type="submit"
          aria-label="Добавить"
          disabled={!title.trim() || save.isPending}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-[opacity,transform] active:scale-90 disabled:opacity-0"
        >
          <ArrowUp size={18} strokeWidth={2.4} />
        </button>
      </form>

      {!loaded ? (
        <Rows>
          {[70, 50, 62].map((w) => (
            <div key={w} className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="h-[22px] w-[22px] rounded-full" />
              <Skeleton className="h-4" style={{ width: `${w}%` }} />
            </div>
          ))}
        </Rows>
      ) : !open.length ? (
        <div className="flex flex-col items-center py-12 text-center">
          <LogoMark size={36} />
          <div className="mt-4 text-[16px] font-medium">{done.length ? 'На сегодня всё' : 'Задач на сегодня нет'}</div>
          <div className="mt-1 text-[14px] text-fg-3">{done.length ? `Выполнено: ${done.length}` : 'Добавьте первую в поле выше'}</div>
        </div>
      ) : (
        <>
          {overdue.length > 0 && (
            <Group title="Просрочено" tone="bad">
              {overdue.map((t) => (
                <TaskRow key={t.id} task={t} overdue />
              ))}
            </Group>
          )}
          {now.length > 0 && (
            <Group title={overdue.length ? 'Сегодня' : undefined}>
              {now.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </Group>
          )}
        </>
      )}

      {done.length > 0 && open.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowDone((s) => !s)} className="flex items-center gap-1 px-1 text-[13px] font-medium text-fg-3">
            Выполнено · {done.length}
            <ChevronDown size={14} className={clsx('transition-transform duration-200', showDone && 'rotate-180')} />
          </button>
          {showDone && (
            <Rows className="mt-2 animate-[fade-in_200ms_ease-out]">
              {done.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </Rows>
          )}
        </div>
      )}
    </div>
  )
}

function TaskRow({ task, overdue }: { task: Task; overdue?: boolean }) {
  const save = useSave('tasks')
  const done = task.status === 'done'
  const toggle = () => {
    if (done) haptic.tap()
    else haptic.success()
    save.mutate({ id: task.id, status: done ? 'todo' : 'done' })
  }
  return (
    <div onClick={toggle} className="flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors active:bg-hover">
      <div className="scale-[1.2]">
        <Checkbox checked={done} onChange={toggle} label={done ? 'Вернуть в работу' : 'Выполнить'} />
      </div>
      <span className={clsx('min-w-0 flex-1 text-[16px] leading-snug', done && 'text-fg-3 line-through decoration-fg-3/60')}>{task.title}</span>
      {(task.due_time || overdue) && (
        <span className={clsx('shrink-0 text-[13px] tabular', overdue ? 'font-medium text-bad' : 'text-fg-3')}>
          {overdue ? relDate(task.due_date) : task.due_time}
        </span>
      )}
    </div>
  )
}
