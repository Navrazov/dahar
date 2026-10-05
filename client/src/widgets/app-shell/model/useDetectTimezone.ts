import { useEffect } from 'react'
import { useSetSetting, useSettings, useSettingsLoaded } from '@/shared/api'

export function useDetectTimezone() {
  const settings = useSettings()
  const loaded = useSettingsLoaded()
  const { mutate } = useSetSetting()
  useEffect(() => {
    if (!loaded || settings.timezone) return
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz) mutate({ key: 'timezone', value: tz })
  }, [loaded, settings.timezone, mutate])
}
