import { accountNow } from '@/shared/lib'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { UserContext } from '@/entities/session'
import { EditorProvider } from '@/features/edit-record'
import { useEffect, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { format } from 'date-fns'
import { CheckCircle2, Repeat, ListTodo, Grid2X2, RefreshCw, type LucideIcon } from 'lucide-react'
import { useSettings } from '@/shared/api'
import { haptic, webApp } from '@/shared/lib'
import { Button, LogoMark, PageReady, Spinner, TopProgress } from '@/shared/ui'
import { isEnabled } from '@/entities/module'
import { useMiniAppAuth } from '../model/useMiniAppAuth'
import { useQueryClient } from '@tanstack/react-query'
import { TasksTab } from './TasksTab'
import { WeekTab } from './WeekTab'
import { ProjectsTab } from './ProjectsTab'
import { TodayTab } from './TodayTab'
import { HabitsTab } from './HabitsTab'
import { MoneyTab } from './MoneyTab'

type Tab = 'today' | 'tasks' | 'habits' | 'money' | 'projects' | 'week' | 'more'

const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: 'today', label: 'Сегодня', icon: CheckCircle2 },
  { key: 'habits', label: 'Привычки', icon: Repeat },
  { key: 'tasks', label: 'Задачи', icon: ListTodo },
  { key: 'more', label: 'Ещё', icon: Grid2X2 },
]

export function MiniApp({ sections }: { sections: ReactNode }) {
  const { state, retry, user } = useMiniAppAuth()
  if (state === 'loading') {
    return (
      <Center>
        <Spinner size={20} className="text-fg-3" />
      </Center>
    )
  }
  if (state === 'not_linked') return <NotLinked retry={retry} />
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
  if (!user) return null
  return (
    <UserContext.Provider value={user}>
      <EditorProvider compact>
        <Shell sections={sections} />
      </EditorProvider>
    </UserContext.Provider>
  )
}

function Shell({ sections }: { sections: ReactNode }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const settings = useSettings()
  const tabs = TABS.filter((t) => t.key !== 'habits' || isEnabled(settings, 'habits'))
  const qc = useQueryClient()
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const change = () => setOnline(navigator.onLine)
    window.addEventListener('online', change)
    window.addEventListener('offline', change)
    return () => {
      window.removeEventListener('online', change)
      window.removeEventListener('offline', change)
    }
  }, [])
  useEffect(() => {
    const back = webApp()?.BackButton
    const go = () => navigate('/')
    if (pathname === '/') back?.hide()
    else back?.show()
    back?.onClick(go)
    return () => {
      back?.offClick(go)
      back?.hide()
    }
  }, [pathname, navigate])
  const current: Tab =
    pathname === '/tasks'
      ? 'tasks'
      : pathname === '/habits' && isEnabled(settings, 'habits')
        ? 'habits'
        : pathname === '/review'
          ? 'week'
          : pathname === '/projects'
            ? 'projects'
            : pathname === '/money' && isEnabled(settings, 'finance')
              ? 'money'
              : pathname !== '/'
                ? 'more'
                : 'today'
  const title =
    current === 'week' ? 'Итоги недели' : current === 'projects' ? 'Проекты' : current === 'money' ? 'Деньги' : TABS.find((t) => t.key === current)!.label
  const home = ['/', '/more', '/tasks', '/habits', '/projects', '/money', '/review'].includes(pathname)

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <TopProgress />
      {home && (
        <header className="px-5 pt-[calc(16px+var(--tg-content-safe-area-inset-top,0px))] pb-3">
          <div className="text-[13px] text-fg-3 first-letter:uppercase">{format(accountNow(), 'EEEE, d MMMM')}</div>
          <div className="flex items-center justify-between">
            <h1 className="mt-0.5 text-[28px] leading-tight font-semibold tracking-[-0.03em]">{title}</h1>
            <button
              type="button"
              aria-label="Обновить данные"
              onClick={() => {
                haptic.tap()
                void qc.invalidateQueries()
              }}
              className="flex h-11 w-11 items-center justify-center rounded-full text-fg-3 active:bg-hover"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </header>
      )}

      <main
        key={current}
        className={clsx(
          'animate-page-in px-4 pb-[calc(96px+var(--tg-safe-area-inset-bottom,0px))]',
          !home && 'pt-[calc(16px+var(--tg-content-safe-area-inset-top,0px))]',
        )}
      >
        {!online && (
          <div role="alert" className="mb-4 rounded-xl border border-line bg-surface p-3 text-sm">
            Нет сети. Здесь видны последние загруженные данные; изменения требуют соединения.
          </div>
        )}
        {['/projects', '/tasks', '/review'].includes(pathname) && (
          <Link to="/more" className="mb-4 block min-h-9 text-sm text-accent">
            ← Все разделы
          </Link>
        )}
        <PageReady key={pathname + current}>
          {current === 'week' && <WeekTab />}
          {current === 'tasks' && <TasksTab />}
          {current === 'projects' && <ProjectsTab />}
          {current === 'today' && <TodayTab />}
          {current === 'habits' && <HabitsTab />}
          {current === 'money' && <MoneyTab />}
          {current === 'more' && sections}
        </PageReady>
      </main>

      {tabs.length > 1 && (
        <nav
          aria-label="Разделы мини-приложения"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 pb-[max(8px,var(--tg-safe-area-inset-bottom,0px))] backdrop-blur-xl"
        >
          <div className="mx-auto flex max-w-md">
            {tabs.map((t) => {
              const active = t.key === current || (t.key === 'more' && ['week', 'projects', 'money'].includes(current))
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    if (!active) haptic.select()
                    navigate(t.key === 'more' ? '/more' : t.key === 'tasks' ? '/tasks' : t.key === 'habits' ? '/habits' : '/')
                    window.scrollTo({ top: 0 })
                  }}
                  aria-current={active ? 'page' : undefined}
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

function NotLinked({ retry }: { retry: () => void }) {
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
      <Button className="mt-3 h-11" onClick={retry}>
        Проверить подключение
      </Button>
    </Center>
  )
}

function Center({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh animate-[fade-in_300ms_ease-out] flex-col items-center justify-center bg-bg px-8 text-center text-fg">{children}</div>
}
