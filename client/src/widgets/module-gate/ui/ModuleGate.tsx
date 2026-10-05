import type { ReactNode } from 'react'
import { useSettings, useSettingsLoaded, type ModuleKey } from '@/shared/api'
import { Button, Card, Empty } from '@/shared/ui'
import { isEnabled, moduleByKey, moduleLabel } from '@/entities/module'
import { useModuleToggle } from '@/features/toggle-module'

export function ModuleGate({ module, children }: { module: ModuleKey; children: ReactNode }) {
  const settings = useSettings()
  const loaded = useSettingsLoaded()
  const toggle = useModuleToggle()
  if (!loaded) return null
  if (isEnabled(settings, module)) return <>{children}</>
  return (
    <Card className="mx-auto mt-10 max-w-lg">
      <Empty
        title={`«${moduleLabel(settings, module)}» не подключено`}
        hint={moduleByKey[module].description}
        action={
          <Button variant="primary" onClick={() => toggle(module, { enabled: true })}>
            Подключить
          </Button>
        }
      />
    </Card>
  )
}
