import { useState } from 'react'
import { toast } from 'sonner'
import clsx from 'clsx'
import { type ModuleKey, useList, useSave, useSetSetting, useSettings } from '@/shared/api'
import { Card, CardHeader, Input, Switch } from '@/shared/ui'
import { isEnabled, moduleCatalog, moduleLabel } from '@/entities/module'
import { SettingControl } from '@/features/module-settings'
import { useModuleToggle } from '@/features/toggle-module'

export function Modules() {
  const settings = useSettings()
  const toggle = useModuleToggle()
  const set = useSetSetting()
  const saveProject = useSave('projects')
  const projects = useList('projects')
  const [labels, setLabels] = useState<Partial<Record<ModuleKey, string>>>({})

  const enable = async (key: ModuleKey, on: boolean) => {
    await toggle(key, { enabled: on })
    const def = moduleCatalog.find((m) => m.key === key)!
    if (on && def.projectSetting && !settings[def.projectSetting]) {
      const project = await saveProject.mutateAsync({ name: moduleLabel(settings, key), status: 'active', area: 'Направления', color: '#5b5bd6' })
      await set.mutateAsync({ key: def.projectSetting, value: project.id })
      toast.success(`Подключено. Создан проект «${project.name}»`)
    } else toast.success(on ? 'Направление подключено' : 'Направление отключено. Данные сохранены')
  }

  return (
    <Card className="lg:col-span-2" id="modules">
      <CardHeader title="Направления" sub="какие разделы видны в меню" />
      <p className="px-4 pb-3 text-[12.5px] text-fg-3">
        Отключение только скрывает раздел — данные остаются. Направление можно переименовать: например, «Бизнес» → «Парфюм-бизнес».
      </p>
      <div className="grid gap-3 px-4 pb-4 md:grid-cols-2 xl:grid-cols-3">
        {moduleCatalog.map((m) => {
          const on = isEnabled(settings, m.key)
          const linked = m.projectSetting ? projects.find((p) => p.id === settings[m.projectSetting!]) : null
          return (
            <div
              key={m.key}
              className={clsx('flex flex-col gap-3 rounded-[9px] border p-3 transition-colors', on ? 'border-accent/40 bg-accent-soft/30' : 'border-line')}
            >
              <div className="flex items-start gap-3">
                <div className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px]', on ? 'bg-ink text-on-ink' : 'bg-surface-2 text-fg-3')}>
                  <m.icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium">{moduleLabel(settings, m.key)}</div>
                  <div className="text-[12.5px] text-fg-3">{m.description}</div>
                </div>
                <Switch checked={on} onChange={(v) => enable(m.key, v)} />
              </div>
              {on && (
                <div className="flex flex-col gap-2 border-t border-line pt-3">
                  <Input
                    value={labels[m.key] ?? settings.modules?.[m.key]?.label ?? ''}
                    placeholder={`Название: ${m.label}`}
                    onChange={(e) => setLabels((l) => ({ ...l, [m.key]: e.target.value }))}
                    onBlur={() => labels[m.key] !== undefined && toggle(m.key, { label: labels[m.key] || null })}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                  {m.projectSetting && (
                    <SettingControl
                      item={{ key: m.projectSetting, label: 'Проект', type: 'project' }}
                      value={settings[m.projectSetting] ?? null}
                      onChange={(v) => set.mutate({ key: m.projectSetting!, value: v })}
                    />
                  )}
                  {m.projectSetting && (
                    <span className="text-[12px] text-fg-3">
                      {linked ? 'Новые записи привязываются к этому проекту' : 'Без проекта записи не попадут на страницу проекта'}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
