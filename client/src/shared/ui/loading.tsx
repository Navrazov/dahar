import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import clsx from 'clsx'
import { useIsFetching, useIsMutating, useQueryClient } from '@tanstack/react-query'

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={clsx('skeleton', className)} style={style} aria-hidden />
}

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return <span role="status" aria-label="Загрузка" className={clsx('spinner shrink-0', className)} style={{ width: size, height: size }} />
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-[18px] w-[18px] rounded-full" />
          <Skeleton className="h-3.5" style={{ width: `${70 - ((i * 17) % 35)}%` }} />
          <Skeleton className="ml-auto h-3 w-14" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonCard({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={clsx('rounded-[10px] border border-line bg-surface', className)}>
      <div className="px-4 pt-4 pb-2">
        <Skeleton className="h-4 w-32" />
      </div>
      <SkeletonRows rows={rows} />
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="animate-[fade-in_300ms_ease-out_120ms_both]" aria-busy="true" aria-label="Загрузка">
      <div className="mb-7">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2.5 h-4 w-72 max-w-full" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-[10px] border border-line bg-surface px-4 py-3.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2.5 h-6 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <SkeletonCard rows={6} />
        <SkeletonCard rows={4} />
      </div>
    </div>
  )
}

/** Тонкая полоса сверху, пока идут запросы. Появляется с задержкой, чтобы не мигать на быстрых ответах. */
export function TopProgress() {
  const busy = useIsFetching() + useIsMutating() > 0
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!busy) return setShown(false)
    const t = setTimeout(() => setShown(true), 250)
    return () => clearTimeout(t)
  }, [busy])
  return (
    <div
      className={clsx(
        'pointer-events-none fixed inset-x-0 top-0 z-[90] h-[2px] overflow-hidden transition-opacity duration-300',
        shown ? 'opacity-100' : 'opacity-0',
      )}
      aria-hidden
    >
      <div className="h-full w-full origin-left bg-accent animate-[progress_1.1s_ease-in-out_infinite]" />
    </div>
  )
}

const PendingContext = createContext<((delta: number) => void) | null>(null)

/** Fallback для Suspense: держит PageReady в состоянии загрузки, пока грузится код страницы. */
export function SuspenseSkeleton() {
  const report = useContext(PendingContext)
  useEffect(() => {
    report?.(1)
    return () => report?.(-1)
  }, [report])
  return report ? null : <PageSkeleton />
}

/**
 * Пока страница впервые получает данные, показывает скелетон вместо пустых списков.
 * Страница при этом уже смонтирована (скрыта), чтобы её запросы стартовали.
 * Повторные загрузки (смена фильтра, фоновое обновление) скелетон не включают.
 */
export function PageReady({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [ready, setReady] = useState(false)
  const pending = useRef(0)
  const [report] = useState(() => (delta: number) => {
    pending.current += delta
    schedule.current?.()
  })
  const schedule = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (ready) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const loading = () =>
      pending.current > 0 ||
      qc
        .getQueryCache()
        .findAll()
        .some((q) => q.state.data === undefined && q.state.fetchStatus === 'fetching')
    // проверяем на следующем тике: к этому моменту эффекты страницы уже запустили её запросы
    const check = () => {
      clearTimeout(timer)
      timer = setTimeout(() => !loading() && setReady(true), 0)
    }
    schedule.current = check
    check()
    const unsubscribe = qc.getQueryCache().subscribe(check)
    return () => {
      clearTimeout(timer)
      unsubscribe()
      schedule.current = null
    }
  }, [qc, ready])

  return (
    <PendingContext.Provider value={report}>
      {!ready && <PageSkeleton />}
      <div className={ready ? 'animate-page-in' : 'hidden'}>{children}</div>
    </PendingContext.Provider>
  )
}
