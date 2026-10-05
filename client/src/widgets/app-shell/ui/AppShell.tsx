import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu, Plus, X } from 'lucide-react'
import { ErrorBoundary, Logo } from '@/shared/ui'
import { useDetectTimezone } from '../model/useDetectTimezone'
import { useEditor } from '@/features/edit-record'
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

export function AppShell() {
  useDetectTimezone()
  useNewTaskHotkey()
  const [mobileOpen, setMobileOpen] = useState(false)
  const edit = useEditor()
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
    setMobileOpen(false)
  }, [pathname])

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] lg:block">
        <Sidebar />
      </aside>

      <header className="sticky top-0 z-20 flex h-[calc(3.25rem+env(safe-area-inset-top))] items-center gap-2 border-b border-line bg-bg/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
        <button type="button" aria-label="Меню" onClick={() => setMobileOpen(true)} className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-[7px] hover:bg-hover">
          <Menu size={19} />
        </button>
        <Logo />
        <button type="button" aria-label="Новая задача" onClick={() => edit('tasks')} className="ml-auto flex h-9 w-9 items-center justify-center rounded-[7px] bg-ink text-on-ink">
          <Plus size={18} />
        </button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/35" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-bg shadow-xl">
            <button
              type="button"
              aria-label="Закрыть меню"
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-[7px] text-fg-3 hover:bg-hover"
            >
              <X size={17} />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <main className="lg:pl-[248px]">
        <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <ErrorBoundary key={pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  )
}
