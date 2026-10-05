import { CalendarDays, CalendarRange, CheckSquare, FolderKanban, LayoutDashboard, Target, type LucideIcon } from 'lucide-react'
import type { CollectionName, ModuleKey } from '@/shared/api'

export const coreNav: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Сегодня', icon: LayoutDashboard, end: true },
  { to: '/tasks', label: 'Задачи', icon: CheckSquare },
  { to: '/calendar', label: 'Календарь', icon: CalendarDays },
  { to: '/projects', label: 'Проекты', icon: FolderKanban, end: true },
  { to: '/goals', label: 'Цели', icon: Target },
  { to: '/review', label: 'Итоги недели', icon: CalendarRange },
]

export const quickAdd: { table: CollectionName; label: string; module?: ModuleKey }[] = [
  { table: 'tasks', label: 'Задача' },
  { table: 'events', label: 'Событие' },
  { table: 'projects', label: 'Проект' },
  { table: 'goals', label: 'Цель' },
  { table: 'habits', label: 'Привычка', module: 'habits' },
  { table: 'transactions', label: 'Доход или расход', module: 'finance' },
  { table: 'partners', label: 'Партнёр', module: 'partners' },
  { table: 'trades', label: 'Сделка', module: 'trading' },
  { table: 'sales', label: 'Продажа', module: 'business' },
]
