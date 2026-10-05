import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { type Settings, useSetSetting, useSettings } from '@/shared/api'
import { Button, Card, CardHeader, FieldLabel, Input } from '@/shared/ui'
import { useUser } from '@/entities/session'
import { SettingControl, type SettingItem } from '@/features/module-settings'

const general: SettingItem[] = [
  { key: 'currency', label: 'Основная валюта', type: 'currency', hint: 'Одна валюта для финансов и бизнеса. После появления сумм смена валюты недоступна' },
  { key: 'trading_currency', label: 'Валюта трейдинга', type: 'currency', hint: 'После появления сумм смена валюты недоступна' },
]

export function Profile() {
  const user = useUser()
  const settings = useSettings()
  const set = useSetSetting()
  const [draft, setDraft] = useState<Settings>({})
  useEffect(() => {
    setDraft(settings)
  }, [settings])

  const save = async () => {
    try {
      for (const k of ['user_name', ...general.map((g) => g.key)] as (keyof Settings)[]) {
        if (draft[k] !== settings[k]) await set.mutateAsync({ key: k, value: draft[k] ?? null })
      }
      toast.success('Сохранено')
    } catch {
      /* Mutation handler shows the error; keep the draft for correction. */
    }
  }

  return (
    <Card>
      <CardHeader title="Профиль" sub={`@${user.login}`} />
      <div className="space-y-4 px-4 pb-4">
        <FieldLabel label="Как к вам обращаться">
          <Input
            value={draft.user_name ?? ''}
            onChange={(e) => setDraft({ ...draft, user_name: e.target.value })}
            placeholder={user.name || 'Имя для приветствия'}
          />
        </FieldLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          {general.map((g) => (
            <FieldLabel key={g.key} label={g.label} hint={g.hint}>
              <SettingControl item={g} value={draft[g.key] ?? (g.key === 'currency' ? '₽' : '$')} onChange={(v) => setDraft((d) => ({ ...d, [g.key]: v }))} />
            </FieldLabel>
          ))}
        </div>
        <div className="flex justify-end">
          <Button variant="primary" onClick={save}>
            Сохранить
          </Button>
        </div>
      </div>
    </Card>
  )
}
