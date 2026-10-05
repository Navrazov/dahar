import { useState } from 'react'
import { toast } from 'sonner'
import { Settings2 } from 'lucide-react'
import { useList, useSetSetting, useSettings, type Settings } from '@/shared/api'
import { currencies } from '@/shared/config'
import { Button, FieldLabel, Modal, NumberInput, Select } from '@/shared/ui'
import { useProjectOptions } from '@/entities/project'

export type SettingItem = { key: keyof Settings; label: string; type: 'project' | 'number' | 'currency' | 'account'; hint?: string; suffix?: string }

const idValue = (v: unknown) => (v == null ? null : String(v))
const idChange = (onChange: (v: unknown) => void) => (v: string | null) => onChange(v ? Number(v) : null)

export function SettingControl({ item, value, onChange }: { item: SettingItem; value: any; onChange: (v: any) => void }) {
  const projectOptions = useProjectOptions()
  const accounts = useList('accounts')
  if (item.type === 'project') {
    return <Select value={idValue(value)} onChange={idChange(onChange)} options={projectOptions} clearable clearLabel="Не привязан" placeholder="Не привязан" />
  }
  if (item.type === 'account') {
    const options = accounts.filter((a) => !a.archived).map((a) => ({ value: String(a.id), label: a.name, dot: a.color }))
    const auto = 'Автоматически (первая карта)'
    return <Select value={idValue(value)} onChange={idChange(onChange)} options={options} clearable clearLabel={auto} placeholder={auto} />
  }
  if (item.type === 'currency') return <Select value={value ?? null} onChange={onChange} options={currencies} />
  return <NumberInput value={value ?? null} onChange={onChange} suffix={item.suffix} />
}

export function ModuleSettings({ title, items }: { title: string; items: SettingItem[] }) {
  const [open, setOpen] = useState(false)
  const settings = useSettings()
  const set = useSetSetting()
  const [draft, setDraft] = useState<Settings>({})

  const save = async () => {
    for (const it of items) if (draft[it.key] !== settings[it.key]) await set.mutateAsync({ key: it.key, value: draft[it.key] ?? null })
    toast.success('Настройки сохранены')
    setOpen(false)
  }

  return (
    <>
      <Button
        icon={Settings2}
        onClick={() => {
          setDraft(settings)
          setOpen(true)
        }}
      >
        Настройки
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        width={460}
        footer={
          <>
            <span />
            <div className="flex gap-2">
              <Button onClick={() => setOpen(false)}>Отмена</Button>
              <Button variant="primary" onClick={save}>
                Сохранить
              </Button>
            </div>
          </>
        }
      >
        <div className="space-y-4">
          {items.map((it) => (
            <FieldLabel key={it.key} label={it.label} hint={it.hint}>
              <SettingControl item={it} value={draft[it.key]} onChange={(v) => setDraft((d) => ({ ...d, [it.key]: v }))} />
            </FieldLabel>
          ))}
        </div>
      </Modal>
    </>
  )
}
