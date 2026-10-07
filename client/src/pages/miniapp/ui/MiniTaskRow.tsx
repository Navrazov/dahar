import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { parseChecklist, serializeChecklist } from '@dahar/shared'
import { addDays } from 'date-fns'
import { ArrowRight, Check, Star, MoreHorizontal, Trash2, CalendarDays } from 'lucide-react'
import clsx from 'clsx'
import { api, invalidateCollection, useList, useRemove, useSave, type Task } from '@/shared/api'
import { accountNow, haptic, relDate, todayStr, ymd } from '@/shared/lib'
import { DropdownMenu, SwipeDelete } from '@/shared/ui'
import { useEditor } from '@/features/edit-record'

export function MiniTaskRow({ task }: { task: Task }) {
  const save = useSave('tasks'),
    edit = useEditor(),
    today = todayStr(),
    projects = useList('projects'),
    remove = useRemove('tasks'),
    qc = useQueryClient()
  const done = task.status === 'done',
    focused = task.focus_date === today,
    late = !done && !!task.due_date && task.due_date < today
  const disabled = save.isPending || remove.isPending || !navigator.onLine
  const deleteTask = async () => {
    if (disabled) return
    try {
      const result = await remove.mutateAsync(task.id)
      haptic.tap()
      toast.success('Задача удалена', {
        duration: 8000,
        action: result.action_id
          ? {
              label: 'Отменить',
              onClick: () => {
                void api
                  .undo(result.action_id!)
                  .then(() => invalidateCollection(qc, 'tasks'))
                  .then(() => toast.success('Задача восстановлена'))
                  .catch((e) => toast.error((e as Error).message))
              },
            }
          : undefined,
      })
    } catch {
      /* The global mutation handler reports the error. */
    }
  }
  const move = (date: string | null) =>
    save.mutate({
      id: task.id,
      due_date: date,
      planned_date: date,
      focus_date: task.focus_date === date ? task.focus_date : null,
      ...(!date ? { due_time: null } : {}),
    })
  const checklist = parseChecklist(task.checklist)
  return (
    <SwipeDelete label={task.title} disabled={disabled} onDelete={() => void deleteTask()}>
      <div data-testid="mini-task" className="px-4 py-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            role="checkbox"
            aria-checked={done}
            aria-label={done ? 'Вернуть в работу' : 'Выполнить'}
            disabled={disabled}
            onClick={() => {
              haptic.tap()
              save.mutate({ id: task.id, status: done ? 'todo' : 'done' })
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center"
          >
            <span
              className={clsx(
                'flex h-6 w-6 items-center justify-center rounded-full border',
                done ? 'border-accent bg-accent text-white' : 'border-line-strong',
              )}
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
              {[
                task.planned_date ? relDate(task.planned_date) : task.due_date ? relDate(task.due_date) : 'Без срока',
                task.planned_date && task.due_date && task.planned_date !== task.due_date ? `срок ${relDate(task.due_date)}` : null,
                task.due_time,
                task.estimate_minutes ? `${task.estimate_minutes} мин.` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </button>
          <DropdownMenu
            align="end"
            className="[&_[role=menuitem]]:min-h-11"
            trigger={
              <button
                type="button"
                aria-label={`Действия: ${task.title}`}
                disabled={disabled}
                className="flex h-11 w-9 shrink-0 items-center justify-center rounded-full text-fg-3 active:bg-hover"
              >
                <MoreHorizontal size={18} />
              </button>
            }
            items={[
              { label: 'На сегодня', icon: CalendarDays, onSelect: () => move(today) },
              { label: 'На завтра', icon: ArrowRight, onSelect: () => move(ymd(addDays(accountNow(), 1))) },
              { label: 'Убрать срок', onSelect: () => move(null) },
              'separator',
              { label: 'Удалить', icon: Trash2, danger: true, onSelect: () => void deleteTask() },
            ]}
          />
          {!done && (
            <button
              type="button"
              aria-label={focused ? 'Убрать из главного' : 'Главное на сегодня'}
              aria-pressed={focused}
              disabled={disabled}
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
        {projects.length > 0 && (
          <select
            aria-label={`Проект задачи ${task.title}`}
            value={task.project_id ?? ''}
            disabled={disabled}
            onChange={(e) => save.mutate({ id: task.id, project_id: e.target.value ? Number(e.target.value) : null })}
            className="mt-1 ml-14 min-h-9 max-w-[calc(100%-56px)] rounded-lg border border-line bg-surface px-2 text-xs text-fg-2"
          >
            <option value="">Добавить в проект</option>
            {projects
              .filter((p) => p.status !== 'archived' || p.id === task.project_id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        )}
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
                    disabled={disabled}
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
            disabled={disabled}
            onClick={() => move(ymd(addDays(accountNow(), 1)))}
            className="mt-1 ml-8 flex min-h-9 items-center gap-1 text-[12px] text-fg-2"
          >
            На завтра <ArrowRight size={13} />
          </button>
        )}
      </div>
    </SwipeDelete>
  )
}
