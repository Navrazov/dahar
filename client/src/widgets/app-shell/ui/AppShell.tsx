import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { CloudOff, Menu, Plus, RefreshCw, Search, X, CalendarDays, CheckSquare, House, NotebookPen } from 'lucide-react'
import { useConnection } from '@/shared/api'
import { ErrorBoundary, Logo, PageReady, TopProgress } from '@/shared/ui'
import { useDetectTimezone } from '../model/useDetectTimezone'
import { useEditor } from '@/features/edit-record'
import { CommandPalette, useCommandPaletteHotkey } from './CommandPalette'
import { Sidebar } from './Sidebar'

function useNewTaskHotkey() {
  const edit = useEditor()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (key !== 'n' && key !== 'т') return
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if ((e.target as HTMLElement).closest('input, textarea, select, button[role=combobox], [contenteditable], [role=dialog], [role=menu]')) return
      e.preventDefault()
      edit('tasks')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [edit])
}

/** Без сети приложение работает на кэше, а изменения копятся в очереди — об этом нужно сказать. */
function ConnectionBanner() {
  const { online, pending } = useConnection()
  if (online && !pending) return null
  return (
    <div
      role="status"
      className="sticky top-0 z-30 flex items-center justify-center gap-2 border-b border-line bg-warn/15 px-4 py-1.5 text-[12.5px] text-fg lg:pl-[248px]"
    >
      {online ? <RefreshCw size={13} className="animate-spin" /> : <CloudOff size={13} />}
      {online
        ? `Отправляем изменения: ${pending}`
        : pending
          ? `Нет сети. Изменений ждут отправки: ${pending} — уйдут, когда появится связь`
          : 'Нет сети. Показаны сохранённые данные, изменения сохранятся и отправятся позже'}
    </div>
  )
}

export function AppShell() {
  useDetectTimezone()
  useNewTaskHotkey()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const openPalette = useCallback(() => setPaletteOpen(true), [])
  useCommandPaletteHotkey(openPalette)
  const edit = useEditor()
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
    setMobileOpen(false)
  }, [pathname])

  return (
    <div className="min-h-screen">
      <TopProgress />
      <ConnectionBanner />
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] lg:block">
        <Sidebar onSearch={openPalette} />
      </aside>

      <header className="sticky top-0 z-20 flex h-[calc(3.25rem+env(safe-area-inset-top))] items-center gap-2 border-b border-line bg-bg/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
        <button
          type="button"
          aria-label="Меню"
          onClick={() => setMobileOpen(true)}
          className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-[7px] transition-[background-color,transform] hover:bg-hover active:scale-90"
        >
          <Menu size={19} />
        </button>
        <Logo />
        <button
          type="button"
          aria-label="Поиск"
          onClick={openPalette}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-[7px] transition-[background-color,transform] hover:bg-hover active:scale-90"
        >
          <Search size={18} />
        </button>
        <button
          type="button"
          aria-label="Новая задача"
          onClick={() => edit('tasks')}
          className="flex h-9 w-9 items-center justify-center rounded-[7px] bg-ink text-on-ink transition-transform active:scale-90"
        >
          <Plus size={18} />
        </button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-[fade-in_200ms_ease-out] bg-black/35" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] animate-[drawer-in_280ms_var(--ease-out)] bg-bg shadow-xl">
            <button
              type="button"
              aria-label="Закрыть меню"
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-[7px] text-fg-3 hover:bg-hover"
            >
              <X size={17} />
            </button>
            <Sidebar
              onNavigate={() => setMobileOpen(false)}
              onSearch={() => {
                setMobileOpen(false)
                openPalette()
              }}
            />
          </aside>
        </div>
      )}

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

      <main className="lg:pl-[248px]">
        <div className="mx-auto max-w-[1240px] px-4 pt-6 pb-24 lg:pb-10 sm:px-6 lg:px-10 lg:py-10">
          <ErrorBoundary key={pathname}>
            <PageReady>
              <Outlet />
            </PageReady>
          </ErrorBoundary>
        </div>
      </main>
      <nav
        aria-label="Основные разделы"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {[
          { to: '/', label: 'Сегодня', icon: House },
          { to: '/tasks', label: 'Задачи', icon: CheckSquare },
          { to: '/calendar', label: 'Календарь', icon: CalendarDays },
          { to: '/review', label: 'Итоги', icon: NotebookPen },
        ].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${isActive ? 'text-accent' : 'text-fg-3'}`}
          >
            <item.icon size={20} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
