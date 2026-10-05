import { useSetSetting, useSettings, type ModuleKey, type ModulesSetting } from '@/shared/api'
import { isEnabled } from '@/entities/module'

export function useModuleToggle() {
  const settings = useSettings()
  const set = useSetSetting()
  return (key: ModuleKey, patch: { enabled?: boolean; label?: string | null }) => {
    const current = settings.modules?.[key] ?? { enabled: isEnabled(settings, key) }
    const modules: ModulesSetting = { ...settings.modules, [key]: { ...current, ...patch } }
    return set.mutateAsync({ key: 'modules', value: modules })
  }
}
