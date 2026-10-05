import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download, Upload } from 'lucide-react'
import { api, useList } from '@/shared/api'
import { Button, Card, CardHeader } from '@/shared/ui'
import { seedDemo } from '../model/seed'

export function Data() {
  const qc = useQueryClient()
  const projects = useList('projects')
  const [busy, setBusy] = useState(false)

  const restore = async (file?: File) => {
    if (!file) return
    try {
      const json = JSON.parse(await file.text())
      await api.restore(json)
      await qc.invalidateQueries()
      toast.success('Данные восстановлены из резервной копии')
    } catch (e) {
      toast.error('Не удалось восстановить: ' + (e as Error).message)
    }
  }

  const demo = async () => {
    setBusy(true)
    const id = toast.loading('Загружаю пример данных…')
    try {
      await seedDemo()
      await qc.invalidateQueries()
      toast.success('Пример загружен, загляните на главную', { id })
    } catch (e) {
      toast.error('Ошибка: ' + (e as Error).message, { id })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader title="Данные" />
      <div className="flex flex-wrap gap-2 px-4 pb-3">
        <a href="/api/backup" download>
          <Button icon={Download}>Скачать резервную копию</Button>
        </a>
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[7px] border border-line bg-surface px-3.5 text-[13.5px] font-medium hover:border-line-strong hover:bg-hover">
          <Upload size={15} /> Восстановить из копии
          <input type="file" accept="application/json" hidden onChange={(e) => restore(e.target.files?.[0])} />
        </label>
        {!projects.length && (
          <Button onClick={demo} loading={busy}>
            Загрузить пример данных
          </Button>
        )}
      </div>
      <p className="px-4 pb-4 text-[12.5px] text-fg-3">Копия содержит только ваши данные. Восстановление полностью заменяет текущие данные вашего аккаунта.</p>
    </Card>
  )
}
