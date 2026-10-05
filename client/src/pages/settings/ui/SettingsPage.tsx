import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { PageHeader } from '@/shared/ui'
import { Profile } from './Profile'
import { Password } from './Password'
import { TwoFactor } from './TwoFactor'
import { Modules } from './Modules'
import { Data } from './Data'
import { Notifications } from './Notifications'
import { BrowserPush } from './BrowserPush'

export function SettingsPage() {
  const { hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  return (
    <>
      <PageHeader title="Настройки" />
      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        <Profile />
        <Password />
        <TwoFactor />
        <Notifications />
        <BrowserPush />
        <Modules />
        <Data />
      </div>
    </>
  )
}
