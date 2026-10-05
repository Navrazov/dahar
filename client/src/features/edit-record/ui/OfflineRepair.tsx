import { useState } from 'react'
import { type CollectionName, type OutboxItem, useSettings } from '@/shared/api'
import { Button, Modal } from '@/shared/ui'
import { entities } from '../config/forms'
import { FieldControl } from './FieldControl'

export function OfflineRepair({ item, onClose, onSave }: { item: OutboxItem; onClose: () => void; onSave: (body: string) => Promise<void> }) {
  const original = JSON.parse(item.body || '{}') as Record<string, unknown>
  const bulk = item.url === '/api/tasks/bulk'
  const table = (bulk ? 'tasks' : item.url.split('/')[2]) as CollectionName
  const config = entities[table]
  const settings = useSettings()
  const [values, setValues] = useState<Record<string, any>>((bulk ? original.data : original) as Record<string, unknown>)
  const [busy, setBusy] = useState(false)
  const fields = config?.fields.filter((f) => Object.hasOwn(values, f.name) && (!f.when || f.when(values))) ?? []
  const save = async () => {
    setBusy(true)
    try {
      await onSave(JSON.stringify(bulk ? { ...original, data: values } : values))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose()
      }}
      title="Исправить изменение"
      footer={
        <Button variant="primary" loading={busy} onClick={save}>
          Повторить отправку
        </Button>
      }
    >
      <p className="mb-4 text-[13px] text-fg-2">{item.error}</p>
      {fields.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <FieldControl
              key={f.name}
              field={f}
              table={table}
              settings={settings}
              value={values[f.name]}
              values={values}
              onChange={(value) => setValues((v) => ({ ...v, [f.name]: value }))}
            />
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-fg-3">Можно повторить отправку после исправления причины ошибки или сохранить копию и удалить изменение из очереди.</p>
      )}
    </Modal>
  )
}
