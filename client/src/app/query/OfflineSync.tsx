import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { collectionKey, flushOutbox, OUTBOX_EVENT, pendingCount, type CollectionName, type OutboxChange } from '@/shared/api'

type Row = Record<string, unknown> & { id: unknown }

/** Отражает отложенные изменения в кэше списков и отправляет очередь, когда появляется сеть. */
export function OfflineSync() {
  const qc = useQueryClient()

  useEffect(() => {
    const patch = (table: string, fn: (rows: Row[]) => Row[]) =>
      qc.setQueriesData({ queryKey: collectionKey(table as CollectionName) }, (old: unknown) => (Array.isArray(old) ? fn(old as Row[]) : old))

    const onChange = (e: Event) => {
      const change = (e as CustomEvent<{ change: OutboxChange }>).detail.change
      if (change.kind === 'create') patch(change.table, (rows) => [change.row as Row, ...rows])
      if (change.kind === 'update') patch(change.table, (rows) => rows.map((r) => (r.id === change.row.id ? { ...r, ...change.row } : r)))
      if (change.kind === 'remove') patch(change.table, (rows) => rows.filter((r) => r.id !== change.id))
    }

    const sync = async () => {
      if (!navigator.onLine || !(await pendingCount())) return
      const res = await flushOutbox()
      if (res.sent || res.failed.length) await qc.invalidateQueries()
      if (res.sent) toast.success(`Синхронизировано изменений: ${res.sent}`)
      for (const f of res.failed) toast.error(`Не удалось сохранить изменение: ${f.message}`)
    }

    window.addEventListener(OUTBOX_EVENT, onChange)
    window.addEventListener('online', sync)
    const timer = setInterval(sync, 30_000)
    sync()
    return () => {
      window.removeEventListener(OUTBOX_EVENT, onChange)
      window.removeEventListener('online', sync)
      clearInterval(timer)
    }
  }, [qc])

  return null
}
