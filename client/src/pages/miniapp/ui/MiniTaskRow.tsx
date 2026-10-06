import { parseChecklist, serializeChecklist } from '@dahar/shared'
import { addDays } from 'date-fns'
import { ArrowRight, Check, Star } from 'lucide-react'
import clsx from 'clsx'
import { useSave, type Task } from '@/shared/api'
import { accountNow, haptic, relDate, todayStr, ymd } from '@/shared/lib'
import { useEditor } from '@/features/edit-record'

export function MiniTaskRow({ task }: { task: Task }) {
  const save = useSave('tasks'),
    edit = useEditor(),
    today = todayStr()
  const done = task.status === 'done',
    focused = task.focus_date === today,
    late = !done && !!task.due_date && task.due_date < today
  const checklist = parseChecklist(task.checklist)
  return (
    <div data-testid="mini-task" className="px-4 py-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? 'Вернуть в работу' : 'Выполнить'}
          disabled={save.isPending || !navigator.onLine}
          onClick={() => {
            haptic.tap()
            save.mutate({ id: task.id, status: done ? 'todo' : 'done' })
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center"
        >
          <span
            className={clsx('flex h-6 w-6 items-center justify-center rounded-full border', done ? 'border-accent bg-accent text-white' : 'border-line-strong')}
          >
            {done && <Check size={14} />}
          </span>
        </button>
        <button
          type="button"
          aria-label={task.title}
          aria-describedby={`mini-task-meta-${task.id}`}
          onClick={() => {
            haptic.tap()
            edit('tasks', task)
          }}
          className="min-h-11 min-w-0 flex-1 text-left"
        >
          <span className={clsx('block break-words text-[16px] leading-snug', done && 'text-fg-3 line-through')}>{task.title}</span>
          <span id={`mini-task-meta-${task.id}`} className="mt-1 block text-[12px] text-fg-3">
            {[task.due_date ? relDate(task.due_date) : 'Без срока', task.due_time, task.estimate_minutes ? `${task.estimate_minutes} мин.` : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </button>
        {!done && (
          <button
            type="button"
            aria-label={focused ? 'Убрать из главного' : 'Главное на сегодня'}
            aria-pressed={focused}
            disabled={save.isPending || !navigator.onLine}
            onClick={() => {
              haptic.select()
              save.mutate({ id: task.id, focus_date: focused ? null : today })
            }}
            className={clsx('flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-hover', focused ? 'text-accent' : 'text-fg-3')}
          >
            <Star size={20} fill={focused ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>
      {checklist.length > 0 && (
        <details className="mt-1 ml-8 text-[13px] text-fg-2">
          <summary className="min-h-9 cursor-pointer py-2">
            Шаги: {checklist.filter((s) => s.done).length}/{checklist.length}
          </summary>
          <div className="space-y-1">
            {checklist.map((step, index) => (
              <label key={index} className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  checked={step.done}
                  disabled={save.isPending || !navigator.onLine}
                  onChange={() =>
                    save.mutate({ id: task.id, checklist: serializeChecklist(checklist.map((s, i) => (i === index ? { ...s, done: !s.done } : s))) })
                  }
                />
                <span className={step.done ? 'line-through' : ''}>{step.text}</span>
              </label>
            ))}
          </div>
        </details>
      )}
      {late && (
        <button
          type="button"
          disabled={save.isPending || !navigator.onLine}
          onClick={() => save.mutate({ id: task.id, due_date: ymd(addDays(accountNow(), 1)) })}
          className="mt-1 ml-8 flex min-h-9 items-center gap-1 text-[12px] text-fg-2"
        >
          На завтра <ArrowRight size={13} />
        </button>
      )}
    </div>
  )
}
