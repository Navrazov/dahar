import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, failedChanges, discardChange, retryChange, flushOutbox, OUTBOX_EVENT } from '@/shared/api'
import { OfflineRepair } from '@/features/edit-record'
import { Button, Modal } from '@/shared/ui'

type Failure = Awaited<ReturnType<typeof failedChanges>>[number]
export function SyncStatus() {
  const qc = useQueryClient()
  const [failed, setFailed] = useState<Failure[]>([])
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Failure | null>(null)
  useEffect(() => {
    const refresh = () => {
      failedChanges()
        .then(setFailed)
        .catch(() => {})
    }
    refresh()
    window.addEventListener(OUTBOX_EVENT, refresh)
    const timer = setInterval(refresh, 5000)
    return () => {
      window.removeEventListener(OUTBOX_EVENT, refresh)
      clearInterval(timer)
    }
  }, [])
  useEffect(() => {
    const action = (e: Event) => {
      const id = (e as CustomEvent<{ id: number }>).detail.id
      toast('Изменение сохранено', {
        duration: 8000,
        action: {
          label: 'Отменить',
          onClick: () => {
            api
              .undo(id)
              .then(() => qc.invalidateQueries())
              .catch((e) => toast.error(e.message))
          },
        },
      })
    }
    window.addEventListener('dahar:action', action)
    return () => window.removeEventListener('dahar:action', action)
  }, [qc])
  const retry = async (body: string) => {
    if (!selected) return
    try {
      JSON.parse(body)
      await retryChange(selected.seq!, body)
      setSelected(null)
      await flushOutbox()
      const remaining = await failedChanges()
      setFailed(remaining)
      if (!remaining.length) setOpen(false)
      await qc.invalidateQueries()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const discard = async (f: Failure) => {
    if (!window.confirm('Удалить несохранённое изменение? Зависимые записи могут потребовать исправления.')) return
    await discardChange(f.seq!)
    setFailed(await failedChanges())
    await qc.invalidateQueries()
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(failed, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'dahar-unsaved.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <>
      {!!failed.length && (
        <button
          className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-bad px-4 py-2 text-[13px] text-white lg:bottom-5"
          onClick={() => setOpen(true)}
        >
          Не сохранено изменений: {failed.length} · Исправить
        </button>
      )}
      {open && (
        <Modal open onClose={() => setOpen(false)} title="Несохранённые изменения">
          <p className="mb-4 text-[13px] text-fg-2">Изменения сохранены на устройстве. Исправьте первое — зависимые записи отправятся после него.</p>
          <Button onClick={download}>Сохранить копию изменений</Button>
          {failed.map((f) => (
            <div key={f.seq} className="space-y-2 border-t border-line py-3 text-[13px]">
              <p>{f.error}</p>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setSelected(f)
                  }}
                >
                  Исправить
                </Button>
                <Button onClick={() => discard(f)}>Удалить из очереди</Button>
              </div>
            </div>
          ))}
        </Modal>
      )}
      {selected && <OfflineRepair item={selected} onClose={() => setSelected(null)} onSave={retry} />}
    </>
  )
}
