import { useSettings, type ModuleKey } from '@/shared/api'
import { isEnabled, moduleByKey, moduleCatalog, moduleLabel } from './catalog'

export function useModules() {
  const settings = useSettings()
  return moduleCatalog.filter((m) => isEnabled(settings, m.key)).map((m) => ({ ...m, label: moduleLabel(settings, m.key) }))
}

export function useModule(key: ModuleKey) {
  const settings = useSettings()
  return { enabled: isEnabled(settings, key), label: moduleLabel(settings, key), def: moduleByKey[key] }
}
