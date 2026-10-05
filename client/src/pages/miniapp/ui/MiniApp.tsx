import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { format } from 'date-fns'
import { CheckCircle2, Repeat, Wallet, type LucideIcon } from 'lucide-react'
import { useSettings } from '@/shared/api'
import { haptic, webApp } from '@/shared/lib'
import { Button, LogoMark, Spinner } from '@/shared/ui'
import { isEnabled } from '@/entities/module'
import { useMiniAppAuth } from '../model/useMiniAppAuth'
import { TodayTab } from './TodayTab'
import { HabitsTab } from './HabitsTab'
import { MoneyTab } from './MoneyTab'

type Tab = 'today' | 'habits' | 'money'

const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: 'today', label: 'Сегодня', icon: CheckCircle2 },
  { key: 'habits', label: 'Привычки', icon: Repeat },
  { key: 'money', label: 'Деньги', icon: Wallet },
]

export function MiniApp() {
  const { state, retry } = useMiniAppAuth()
  if (state === 'loading') {
    return (
      <Center>
        <Spinner size={20} className="text-fg-3" />
      </Center>
    )
  }
  if (state === 'not_linked') return <NotLinked />
  if (state === 'outside') {
    return (
      <Center>
        <LogoMark size={40} />
        <h1 className="mt-5 text-[20px] font-semibold tracking-[-0.02em]">Откройте из Telegram</h1>
        <p className="mt-2 max-w-[280px] text-[14px] text-fg-2">Это мини-приложение работает внутри бота Dahar — нажмите кнопку «Dahar» рядом с полем ввода.</p>
      </Center>
    )
  }
  if (state === 'error') {
    return (
      <Center>
        <LogoMark size={40} />
        <p className="mt-5 text-[15px] text-fg-2">Сервер не отвечает</p>
        <Button className="mt-4" onClick={retry}>
          Повторить
        </Button>
      </Center>
    )
  }
  return <Shell />
}

function Shell() {
  const settings = useSettings()
  const tabs = TABS.filter((t) => (t.key === 'habits' ? isEnabled(settings, 'habits') : t.key === 'money' ? isEnabled(settings, 'finance') : true))
  const [tab, setTab] = useState<Tab>('today')
  const current = tabs.some((t) => t.key === tab) ? tab : 'today'
  const title = TABS.find((t) => t.key === current)!.label

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="px-5 pt-[calc(16px+var(--tg-content-safe-area-inset-top,0px))] pb-3">
        <div className="text-[13px] text-fg-3 first-letter:uppercase">{format(new Date(), 'EEEE, d MMMM')}</div>
        <h1 className="mt-0.5 text-[28px] leading-tight font-semibold tracking-[-0.03em]">{title}</h1>
      </header>

      <main key={current} className="animate-page-in px-4 pb-[calc(96px+var(--tg-safe-area-inset-bottom,0px))]">
        {current === 'today' && <TodayTab />}
        {current === 'habits' && <HabitsTab />}
        {current === 'money' && <MoneyTab />}
      </main>

      {tabs.length > 1 && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 pb-[max(8px,var(--tg-safe-area-inset-bottom,0px))] backdrop-blur-xl">
          <div className="mx-auto flex max-w-md">
            {tabs.map((t) => {
              const active = t.key === current
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    if (!active) haptic.select()
                    setTab(t.key)
                    window.scrollTo({ top: 0 })
                  }}
                  className={clsx(
                    'flex flex-1 flex-col items-center gap-1 pt-2.5 pb-1 text-[11px] font-medium transition-colors duration-200',
                    active ? 'text-accent' : 'text-fg-3 active:text-fg-2',
                  )}
                >
                  <t.icon size={22} strokeWidth={active ? 2.2 : 1.8} className="transition-transform duration-200 active:scale-90" />
                  {t.label}
                </button>
              )
            })}
          </div>
        </nav>
      )}
    </div>
  )
}

function NotLinked() {
  const site = location.origin
  return (
    <Center>
      <LogoMark size={40} />
      <h1 className="mt-5 text-[20px] font-semibold tracking-[-0.02em]">Привяжите аккаунт</h1>
      <ol className="mt-4 max-w-[300px] space-y-1.5 text-left text-[14px] text-fg-2">
        <li>1. Откройте Dahar и войдите</li>
        <li>2. Настройки → Telegram → «Привязать»</li>
        <li>3. Вернитесь сюда</li>
      </ol>
      <Button variant="primary" className="mt-6 h-11 px-6" onClick={() => webApp()?.openLink(`${site}/settings#telegram`)}>
        Открыть Dahar
      </Button>
    </Center>
  )
}

function Center({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh animate-[fade-in_300ms_ease-out] flex-col items-center justify-center bg-bg px-8 text-center text-fg">{children}</div>
}
