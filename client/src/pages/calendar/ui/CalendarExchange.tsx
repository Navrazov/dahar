import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, invalidateCollection } from '@/shared/api'
import { Button, Modal } from '@/shared/ui'

export function CalendarExchange() {
  const input = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const [data, setData] = useState('')
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.calendarPreview>> | null>(null)
  const [busy, setBusy] = useState(false)
  const inspect = async (file: File) => {
    try {
      if (file.size > 900000) throw new Error('Файл должен быть меньше 900 КБ')
      const value = await file.text()
      setPreview(await api.calendarPreview(value))
      setData(value)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const apply = async () => {
    setBusy(true)
    try {
      const result = await api.calendarImport(data)
      await invalidateCollection(qc, 'events')
      setPreview(null)
      toast.success(`Добавлено: ${result.created}, обновлено: ${result.updated}`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const download = async () => {
    try {
      const data = await api.calendarExport()
      const url = URL.createObjectURL(new Blob([data], { type: 'text/calendar;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'dahar-calendar.ics'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".ics,text/calendar"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void inspect(file)
          e.target.value = ''
        }}
      />
      <Button onClick={() => input.current?.click()}>Импорт ICS</Button>
      <Button onClick={download}>Экспорт ICS</Button>
      {preview && (
        <Modal
          open
          title="Импорт календаря"
          onClose={() => {
            if (!busy) setPreview(null)
          }}
          footer={
            <Button variant="primary" loading={busy} onClick={apply}>
              Импортировать {preview.events.length} событий
            </Button>
          }
        >
          <p className="mb-3 text-[13px] text-fg-2">
            Существующие события с тем же идентификатором будут обновлены. Время пересчитывается в часовой пояс вашего профиля. Повторяющиеся серии пока не
            поддерживаются.
          </p>
          <div className="max-h-64 overflow-auto">
            {preview.events.map((e, i) => (
              <div key={i} className="border-t border-line py-2 text-[13px]">
                <b>{e.title}</b>
                <p className="text-fg-3">
                  {e.start.replace('T', ' ')}
                  {e.all_day ? ' · весь день' : ''}
                </p>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  )
}
