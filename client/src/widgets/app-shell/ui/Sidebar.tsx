import { NavLink, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { ChevronsUpDown, LayoutGrid, LogOut, Plus, Search, Settings, type LucideIcon } from 'lucide-react'
import { useList } from '@/shared/api'
import { DropdownMenu, Logo } from '@/shared/ui'
import { useModules } from '@/entities/module'
import { useUser } from '@/entities/session'
import { useLogout } from '@/features/auth'
import { useEditor } from '@/features/edit-record'
import { ThemeSwitch } from './ThemeSwitch'
import { coreNav, quickAdd } from '@/shared/config'

const itemCls = (active: boolean) =>
  clsx(
    'flex h-8 items-center gap-2.5 rounded-[7px] px-2.5 text-[14px] transition-[background-color,color,box-shadow] duration-200',
    active ? 'bg-surface font-medium text-fg shadow-[0_1px_2px_rgb(0_0_0/0.06)]' : 'text-fg-2 hover:bg-hover hover:text-fg',
  )

function Item({ to, label, icon: Icon, end, onClick }: { to: string; label: string; icon: LucideIcon; end?: boolean; onClick?: () => void }) {
  return (
    <NavLink to={to} end={end} onClick={onClick} className={({ isActive }) => itemCls(isActive)}>
      <Icon size={16} strokeWidth={1.75} className="shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

function Group({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex h-6 items-center justify-between px-2.5">
        <span className="text-[12px] font-medium text-fg-3">{title}</span>
        {action}
      </div>
      <nav className="flex flex-col gap-px">{children}</nav>
    </div>
  )
}

function QuickAdd() {
  const edit = useEditor()
  const enabled = new Set(useModules().map((m) => m.key))
  return (
    <DropdownMenu
      className="w-[var(--radix-dropdown-menu-trigger-width)]"
      trigger={
        <button
          type="button"
          className="flex h-9 w-full items-center gap-2 rounded-[7px] bg-ink px-3 text-[14px] font-medium text-on-ink transition-colors hover:bg-ink/85"
        >
          <Plus size={16} />
          Добавить
          <kbd className="ml-auto rounded-[4px] border border-on-ink/20 px-1.5 font-sans text-[11px] text-on-ink/70">N</kbd>
        </button>
      }
      items={quickAdd.filter((q) => !q.module || enabled.has(q.module)).map((q) => ({ label: q.label, onSelect: () => edit(q.table) }))}
    />
  )
}

function UserMenu({ onNavigate }: { onNavigate?: () => void }) {
  const user = useUser()
  const logout = useLogout()
  const navigate = useNavigate()
  const name = user.name || user.login
  const go = (to: string) => () => {
    onNavigate?.()
    navigate(to)
  }
  return (
    <DropdownMenu
      className="w-[var(--radix-dropdown-menu-trigger-width)]"
      trigger={
        <button type="button" className="flex h-11 w-full items-center gap-2.5 rounded-[8px] px-2 text-left hover:bg-hover">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-on-ink">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium">{name}</span>
            <span className="block truncate text-[12px] text-fg-3">@{user.login}</span>
          </span>
          <ChevronsUpDown size={14} className="shrink-0 text-fg-3" />
        </button>
      }
      items={[
        { label: 'Настройки', icon: Settings, onSelect: go('/settings') },
        { label: 'Направления', icon: LayoutGrid, onSelect: go('/settings#modules') },
        'separator',
        { label: 'Выйти', icon: LogOut, danger: true, onSelect: logout },
      ]}
    />
  )
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={clsx(itemCls(false), 'w-full')}>
      <Search size={16} strokeWidth={1.75} className="shrink-0" />
      <span className="truncate">Поиск</span>
      <kbd className="ml-auto rounded-[4px] border border-line px-1.5 font-sans text-[11px] text-fg-3">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
    </button>
  )
}

export function Sidebar({ onNavigate, onSearch }: { onNavigate?: () => void; onSearch: () => void }) {
  const projects = useList('projects')
  const modules = useModules()
  const pinned = projects.filter((p) => (p.status === 'active' || p.pinned) && p.status !== 'archived').slice(0, 8)

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-3 pt-5 pb-3">
      <Logo className="px-2.5" />
      <QuickAdd />
      <nav className="flex flex-col gap-px">
        <SearchButton onClick={onSearch} />
        {coreNav.map((n) => (
          <Item key={n.to} {...n} onClick={onNavigate} />
        ))}
      </nav>

      {pinned.length > 0 && (
        <Group title="Проекты в работе">
          {pinned.map((p) => (
            <NavLink key={p.id} to={`/projects/${p.id}`} onClick={onNavigate} className={({ isActive }) => itemCls(isActive)}>
              <span className="flex w-4 shrink-0 justify-center">
                <span className="h-2 w-2 rounded-full" style={{ background: p.color || 'var(--text-3)' }} />
              </span>
              <span className="truncate">{p.name}</span>
            </NavLink>
          ))}
        </Group>
      )}

      <Group
        title="Направления"
        action={
          <NavLink
            to="/settings#modules"
            onClick={onNavigate}
            title="Подключить направление"
            aria-label="Подключить направление"
            className="rounded p-0.5 text-fg-3 hover:bg-hover hover:text-fg"
          >
            <Plus size={14} />
          </NavLink>
        }
      >
        {modules.map((m) => (
          <Item key={m.key} to={m.to} label={m.label} icon={m.icon} onClick={onNavigate} />
        ))}
        {!modules.length && (
          <NavLink to="/settings#modules" onClick={onNavigate} className="px-2.5 py-1 text-[13px] text-fg-3 hover:text-fg">
            Подключить направления
          </NavLink>
        )}
      </Group>

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <ThemeSwitch />
        <UserMenu onNavigate={onNavigate} />
      </div>
    </div>
  )
}
