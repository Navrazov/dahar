import { useEffect, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api, collectionKey, useList } from '@/shared/api'
import { todayStr } from '@/shared/lib'
import { Input, Segmented } from '@/shared/ui'
import { MiniTaskRow } from './MiniTaskRow'
import { QuickTask } from './QuickTask'
import { Rows } from './parts'

type Filter = 'open' | 'inbox' | 'future' | 'done' | 'late' | 'today'
export function TasksTab() {
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
  return (
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
            <MiniTaskRow key={t.id} task={t} />
          ))}
        </Rows>
      ) : (
        <p className="py-8 text-center text-sm text-fg-3">
          {list.isPending ? 'Загрузка…' : search || project ? 'По этому поиску задач нет' : 'Здесь пока нет задач'}
        </p>
      )}
      {list.hasNextPage && (
        <button className="min-h-11 w-full rounded-xl border border-line text-sm" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
          {list.isFetchingNextPage ? 'Загрузка…' : 'Показать ещё'}
        </button>
      )}
    </div>
  )
}
