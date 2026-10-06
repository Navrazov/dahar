import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, collectionKey } from '@/shared/api'
import { todayStr } from '@/shared/lib'
import { Progress } from '@/shared/ui'
import { MiniTaskRow } from './MiniTaskRow'
import { QuickTask } from './QuickTask'
import { Group, Rows } from './parts'

export function TodayTab() {
  const today = todayStr()
  const { data } = useQuery({ queryKey: [...collectionKey('tasks'), 'mini-today', today], queryFn: ({ signal }) => api.miniToday(signal) })
  const focus = data?.focus.items ?? [],
    rest = data?.today.items ?? [],
    late = data?.late.items ?? [],
    done = data?.done.items ?? []
  const focusCount = data?.focus.total ?? 0,
    restCount = data?.today.total ?? 0,
    lateCount = data?.late.total ?? 0,
    doneCount = data?.done.total ?? 0
  const total = focusCount + restCount + doneCount
  return (
    <div className="space-y-5">
      <div className="rounded-[14px] border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-sm font-medium">{total ? `Выполнено ${doneCount} из ${total}` : 'Начни с одного дела'}</span>
          <Link to="/review" className="text-xs text-accent">
            Итоги недели →
          </Link>
        </div>
        <Progress value={total ? doneCount / total : 0} />
      </div>
      <QuickTask date={today} />
      <Group
        title={`Главное на сегодня · ${focusCount}/3`}
        action={
          <Link to="/tasks" className="text-xs text-accent">
            Выбрать →
          </Link>
        }
      >
        {focus.length ? (
          focus.map((t) => <MiniTaskRow key={t.id} task={t} />)
        ) : (
          <p className="px-4 py-5 text-[14px] text-fg-3">Выбери до трёх задач звёздочкой. Они появятся здесь, даже если у них нет срока.</p>
        )}
      </Group>
      {rest.length > 0 && (
        <Group title="Другие дела сегодня">
          {rest.map((t) => (
            <MiniTaskRow key={t.id} task={t} />
          ))}
          {restCount > rest.length && (
            <Link to="/tasks?filter=today" className="block min-h-11 p-3 text-center text-sm text-accent">
              Все дела сегодня →
            </Link>
          )}
        </Group>
      )}
      {late.length > 0 && (
        <details className="rounded-[14px] border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-4 text-[14px] font-medium">Перенести или сделать · {lateCount}</summary>
          <Rows>
            {late.map((t) => (
              <MiniTaskRow key={t.id} task={t} />
            ))}
          </Rows>
          {lateCount > late.length && (
            <Link to="/tasks?filter=late" className="block min-h-11 p-3 text-center text-sm text-accent">
              Все просроченные →
            </Link>
          )}
        </details>
      )}
      {done.length > 0 && (
        <details className="rounded-[14px] border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-4 text-[14px] text-fg-3">Выполнено сегодня · {doneCount}</summary>
          <Rows>
            {done.map((t) => (
              <MiniTaskRow key={t.id} task={t} />
            ))}
          </Rows>
          {doneCount > done.length && (
            <Link to="/tasks?filter=done" className="block min-h-11 p-3 text-center text-sm text-accent">
              Все выполненные →
            </Link>
          )}
        </details>
      )}
      {!focus.length && !rest.length && !late.length && (
        <p className="py-3 text-center text-sm text-fg-3">
          {done.length ? 'На сегодня всё. Хорошая работа.' : 'Запиши задачу или выбери главное из списка дел.'}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Link className="rounded-xl border border-line bg-surface p-4 text-sm font-medium" to="/projects">
          Проекты →
        </Link>
        <Link className="rounded-xl border border-line bg-surface p-4 text-sm font-medium" to="/calendar">
          Календарь →
        </Link>
      </div>
    </div>
  )
}
