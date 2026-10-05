import { NavLink, Outlet } from 'react-router-dom'
import clsx from 'clsx'
import { Activity, Bug, LayoutDashboard, LogOut, ScrollText, Server, Users, type LucideIcon } from 'lucide-react'
import { Logo } from '@/shared/ui'
import { useAdmin } from '@/entities/session'
import { useLogout } from '@/features/auth'

const nav: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Обзор', icon: LayoutDashboard, end: true },
  { to: '/users', label: 'Пользователи', icon: Users },
  { to: '/activity', label: 'Активность', icon: Activity },
  { to: '/errors', label: 'Ошибки', icon: Bug },
  { to: '/system', label: 'Система', icon: Server },
  { to: '/audit', label: 'Журнал действий', icon: ScrollText },
]

const itemCls = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'flex h-8 shrink-0 items-center gap-2.5 rounded-[7px] px-2.5 text-[14px] transition-colors',
    isActive ? 'bg-surface font-medium text-fg shadow-[0_1px_2px_rgb(0_0_0/0.06)]' : 'text-fg-2 hover:bg-hover hover:text-fg',
  )

export function Shell() {
  const admin = useAdmin()
  const logout = useLogout()
  return (
    <div className="min-h-screen lg:pl-[232px]">
      <aside className="z-20 flex flex-col gap-5 border-b border-line px-3 pt-4 pb-3 lg:fixed lg:inset-y-0 lg:left-0 lg:w-[232px] lg:border-b-0 lg:pt-5">
        <div className="px-2.5">
          <Logo />
        </div>
        <nav className="flex gap-px overflow-x-auto lg:flex-col">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={itemCls}>
              <n.icon size={16} strokeWidth={1.75} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center justify-between gap-2 border-t border-line px-2.5 pt-3 lg:mt-auto lg:flex">
          <span className="truncate text-[13px] text-fg-2">{admin.login}</span>
          <button type="button" onClick={logout} title="Выйти" aria-label="Выйти" className="rounded-[6px] p-1.5 text-fg-3 hover:bg-hover hover:text-fg">
            <LogOut size={15} />
          </button>
        </div>
      </aside>
      <main className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <Outlet />
      </main>
    </div>
  )
}
