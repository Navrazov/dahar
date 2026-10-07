import { toast } from 'sonner'
import { addDays } from 'date-fns'
import { useEffect, useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api, collectionKey, invalidateCollection, useList, useSave } from '@/shared/api'
import { accountNow, todayStr, ymd } from '@/shared/lib'
import { Input, Segmented, DragDropProvider, DragHandle, DragShelf, DropZone, type DragItem, type DropTarget } from '@/shared/ui'
import { MiniTaskRow } from './MiniTaskRow'
import { QuickTask } from './QuickTask'
import { Rows } from './parts'

type Filter = 'open' | 'inbox' | 'future' | 'done' | 'late' | 'today'
export function TasksTab() {
  const save = useSave('tasks'),
    qc = useQueryClient(),
    [moving, setMoving] = useState(false)
  const projects = useList('projects'),
    today = todayStr()
  const [params, setParams] = useSearchParams()
  const allowed: Filter[] = ['open', 'inbox', 'future', 'done', 'late', 'today']
  const filter = allowed.includes(params.get('filter') as Filter) ? (params.get('filter') as Filter) : 'open'
  const [search, setSearch] = useState(''),
    [project, setProject] = useState(''),
    [querySearch, setQuerySearch] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQuerySearch(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])
  const list = useInfiniteQuery({
    queryKey: [...collectionKey('tasks'), 'mini-list', filter, querySearch, project, today],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => api.miniTasks({ filter, q: querySearch, project_id: project, limit: 50, offset: pageParam }, signal),
    getNextPageParam: (last) => (last.items.length && last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined),
  })
  const rows = [...new Map((list.data?.pages.flatMap((p) => p.items) ?? []).map((t) => [t.id, t])).values()]
  const total = list.data?.pages[0]?.total ?? 0
  const move = async (item: DragItem, target: DropTarget) => {
    if (target.data.before) {
      if (item.id === Number(target.data.before)) return
      setMoving(true)
      try {
        await api.reorderTask(item.id, Number(target.data.before))
        await invalidateCollection(qc, 'tasks')
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setMoving(false)
      }
      return
    }
    const task = rows.find((t) => t.id === item.id)
    if (!task) return
    if (target.data.status) save.mutate({ id: item.id, status: 'done' })
    else
      save.mutate({
        id: item.id,
        due_date: target.data.date,
        planned_date: target.data.date,
        focus_date: task.focus_date === target.data.date ? task.focus_date : null,
        ...(!target.data.date ? { due_time: null } : {}),
      })
  }
  return (
    <DragDropProvider onDrop={move} disabled={save.isPending || moving || !navigator.onLine}>
      <div className="space-y-4" aria-busy={list.isFetching || search.trim() !== querySearch}>
        <QuickTask />
        <div className="overflow-x-auto [&_button]:min-h-11">
          <Segmented
            value={filter}
            onChange={(v) => {
              setParams({ filter: v })
            }}
            options={[
              { value: 'open', label: 'В работе' },
              { value: 'inbox', label: 'Без срока' },
              { value: 'future', label: 'Позже' },
              { value: 'done', label: 'Готово' },
              ...(filter === 'late' ? [{ value: 'late' as const, label: 'Просрочено' }] : []),
              ...(filter === 'today' ? [{ value: 'today' as const, label: 'Сегодня' }] : []),
            ]}
          />
        </div>
        <Input
          aria-label="Поиск задач"
          placeholder="Найти задачу"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
          }}
        />
        {projects.length > 0 && (
          <select
            aria-label="Проект задач"
            value={project}
            onChange={(e) => {
              setProject(e.target.value)
            }}
            className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm"
          >
            <option value="">Все проекты</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <p className="px-1 text-xs text-fg-3">{list.isPending ? 'Загрузка задач…' : `${total} задач · нажми на название, чтобы изменить`}</p>
        {rows.length ? (
          <Rows>
            {rows.map((t) => (
              <DropZone
                key={t.id}
                target={{
                  id: `before:${t.id}`,
                  label: `Перед «${t.title}»`,
                  data: t.focus_date === today ? { date: t.planned_date || t.due_date || today } : { before: String(t.id) },
                }}
                className="flex items-start"
              >
                <DragHandle item={{ type: 'task', id: t.id, title: t.title }} className="mt-3 w-7" />
                <div className="min-w-0 flex-1">
                  <MiniTaskRow task={t} />
                </div>
              </DropZone>
            ))}
          </Rows>
        ) : (
          <p className="py-8 text-center text-sm text-fg-3">
            {list.isPending ? 'Загрузка…' : search || project ? 'По этому поиску задач нет' : 'Здесь пока нет задач'}
          </p>
        )}
        {list.hasNextPage && (
          <button
            className="min-h-11 w-full rounded-xl border border-line text-sm"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? 'Загрузка…' : 'Показать ещё'}
          </button>
        )}
      </div>
      <DragShelf className="bottom-[calc(88px+var(--tg-safe-area-inset-bottom,0px))]">
        {[
          { id: 'today', label: 'Сегодня', date: today },
          { id: 'tomorrow', label: 'Завтра', date: ymd(addDays(accountNow(), 1)) },
          { id: 'none', label: 'Без срока', date: null },
        ].map((z) => (
          <DropZone
            key={z.id}
            target={{ id: z.id, label: z.label, data: { date: z.date } }}
            className="flex min-h-14 flex-1 items-center justify-center rounded-lg border border-dashed border-line px-3 text-sm"
          >
            {z.label}
          </DropZone>
        ))}
        <DropZone
          target={{ id: 'done', label: 'Выполнить', data: { status: 'done' } }}
          className="flex min-h-14 items-center justify-center rounded-lg border border-dashed border-line px-3 text-sm"
        >
          Готово
        </DropZone>
      </DragShelf>
    </DragDropProvider>
  )
}
