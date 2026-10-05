import type { ReactNode } from 'react'
import clsx from 'clsx'
import { RefreshCw } from 'lucide-react'
import { dateTime } from '../lib/format'
import { Button, Card, PageHeader } from './base'

type QueryStatus = { isPending: boolean; isFetching: boolean; isError: boolean; error: Error | null; dataUpdatedAt: number; refetch: () => Promise<unknown> }

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx('skeleton rounded-md bg-surface-2', className)} />
}

export function PageSkeleton({ table = false }: { table?: boolean }) {
  return (
    <div role="status" aria-label="Загрузка данных" className="space-y-5">
      <span className="sr-only">Загрузка данных…</span>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="space-y-3 p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-32" />
          </Card>
        ))}
      </div>
      {table ? (
        <Card className="space-y-5 p-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="grid grid-cols-4 gap-6">
              <Skeleton className="h-7" />
              <Skeleton className="h-7" />
              <Skeleton className="h-7" />
              <Skeleton className="h-7" />
            </div>
          ))}
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i} className="space-y-4 p-4">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-44" />
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export function QueryState({ query, title, table = false }: { query: QueryStatus; title: string; table?: boolean }) {
  return (
    <>
      <PageHeader title={title} />
      {query.isPending ? (
        <PageSkeleton table={table} />
      ) : (
        <Card role="alert" className="space-y-3 p-5">
          <p className="font-medium">Не удалось загрузить данные</p>
          <p className="text-fg-2">{query.error?.message || 'Проверьте соединение и попробуйте снова'}</p>
          <Button onClick={() => query.refetch()} loading={query.isFetching} icon={RefreshCw}>
            Повторить
          </Button>
        </Card>
      )}
    </>
  )
}

export function QueryToolbar({ query, children }: { query: QueryStatus; children?: ReactNode }) {
  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-[12px] text-fg-3">
        <Button icon={RefreshCw} loading={query.isFetching} onClick={() => query.refetch()}>
          Обновить
        </Button>
        <span role="status">
          {query.isFetching ? 'Обновляем данные…' : query.dataUpdatedAt ? `Обновлено ${dateTime(new Date(query.dataUpdatedAt).toISOString())}` : ''}
        </span>
        {children}
      </div>
      {query.isError && (
        <div role="alert" className="rounded-lg border border-warn/30 bg-warn-soft p-3 text-[13px] text-warn">
          Не удалось обновить: {query.error?.message}. Показаны последние загруженные данные.
        </div>
      )}
    </div>
  )
}

export function Pagination({
  total,
  offset,
  limit,
  onChange,
  busy = false,
}: {
  total: number
  offset: number
  limit: number
  onChange: (offset: number) => void
  busy?: boolean
}) {
  return (
    <nav aria-label="Страницы таблицы" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
      <span className="text-[13px] text-fg-3">{total ? `${offset + 1}–${Math.min(offset + limit, total)} из ${total}` : '0 записей'}</span>
      <div className="flex gap-2">
        <Button disabled={busy || offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
          Назад
        </Button>
        <Button disabled={busy || offset + limit >= total} onClick={() => onChange(offset + limit)}>
          Далее
        </Button>
      </div>
    </nav>
  )
}
