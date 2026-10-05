import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download, Upload } from 'lucide-react'
import { api, useList, pendingCount, failedChanges } from '@/shared/api'
import { fmtDate } from '@/shared/lib'
import { Button, Card, CardHeader, Modal } from '@/shared/ui'
import { seedDemo } from '../model/seed'

export function Data() {
  const qc = useQueryClient()
  const projects = useList('projects')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{ backup: unknown; total: number; counts: Record<string, number> } | null>(null)
  const [checkpoint, setCheckpoint] = useState<number | null>(null)
  const saved = useQuery({ queryKey: ['checkpoints'], queryFn: api.checkpoints })
  const history = useQuery({ queryKey: ['history'], queryFn: api.history })
  const pick = async (file?: File) => {
    if (!file) return
    try {
      const backup = JSON.parse(await file.text())
      const p = await api.restorePreview(backup)
      setPreview({ backup, total: p.total, counts: p.counts })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const restore = async () => {
    setBusy(true)
    try {
      if ((await pendingCount()) || (await failedChanges()).length) throw new Error('Сначала синхронизируйте или разберите несохранённые изменения')
      if (preview) await api.restore(preview.backup)
      else if (checkpoint) await api.restoreCheckpoint(checkpoint)
      await qc.invalidateQueries()
      setPreview(null)
      setCheckpoint(null)
      toast.success('Данные восстановлены. Предыдущая версия сохранена автоматически')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const undo = async (id: number) => {
    try {
      await api.undo(id)
      await qc.invalidateQueries()
      toast.success('Действие отменено')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const demo = async () => {
    setBusy(true)
    try {
      await seedDemo()
      await qc.invalidateQueries()
      toast.success('Пример загружен')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="lg:col-span-2">
      <CardHeader title="Данные и история" />
      <div className="space-y-4 px-4 pb-4">
        <div className="flex flex-wrap gap-2">
          <a href="/api/backup" download>
            <Button icon={Download}>Скачать резервную копию</Button>
          </a>
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[7px] border border-line px-3 text-[13.5px]">
            <Upload size={15} />
            Проверить копию
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                pick(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
          {!projects.length && (
            <Button onClick={demo} loading={busy}>
              Загрузить пример данных
            </Button>
          )}
        </div>
        <p className="text-[12.5px] text-fg-3">
          Копия включает ваши записи, изображения и правила импорта. Перед заменой данных приложение проверит файл и сохранит текущую версию.
        </p>
        {!!saved.data?.length && (
          <div>
            <p className="mb-2 text-[13px] font-medium">Версии перед восстановлением</p>
            {saved.data.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 py-1 text-[13px]">
                <span>{fmtDate(s.created_at, 'd MMM yyyy, HH:mm')}</span>
                <Button size="sm" onClick={() => setCheckpoint(s.id)}>
                  Восстановить
                </Button>
              </div>
            ))}
          </div>
        )}
        {!!history.data?.length && (
          <div>
            <p className="mb-2 text-[13px] font-medium">Последние действия</p>
            {history.data.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2 border-t border-line py-2 text-[13px]">
                <span>
                  {h.label} · {fmtDate(h.created_at, 'd MMM, HH:mm')}
                </span>
                <Button size="sm" disabled={!!h.undone_at} onClick={() => undo(h.id)}>
                  {h.undone_at ? 'Отменено' : 'Отменить'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      {(preview || checkpoint) && (
        <Modal
          open
          onClose={() => {
            if (!busy) {
              setPreview(null)
              setCheckpoint(null)
            }
          }}
          title="Заменить текущие данные?"
          footer={
            <>
              <Button
                disabled={busy}
                onClick={() => {
                  setPreview(null)
                  setCheckpoint(null)
                }}
              >
                Отмена
              </Button>
              <Button variant="danger" loading={busy} onClick={restore}>
                Заменить данные
              </Button>
            </>
          }
        >
          <p className="text-[14px]">
            {preview ? `В проверенной копии ${preview.total} записей.` : 'Будет восстановлена выбранная версия.'} Текущие записи заменятся. Их копия сохранится
            в списке версий.
          </p>
          {preview && <div className="mt-3 text-[13px]">{Object.values(preview.counts).filter((n) => n > 0).length} разделов с данными</div>}
        </Modal>
      )}
    </Card>
  )
}
