import type { Option } from '@/shared/lib'

export const taskStatuses: Option[] = [
  { value: 'todo', label: 'К выполнению', tone: 'gray' },
  { value: 'in_progress', label: 'В работе', tone: 'info' },
  { value: 'done', label: 'Готово', tone: 'good' },
]

export const priorities: Option[] = [
  { value: 'urgent', label: 'Срочно', tone: 'bad' },
  { value: 'high', label: 'Высокий', tone: 'warn' },
  { value: 'medium', label: 'Средний', tone: 'info' },
  { value: 'low', label: 'Низкий', tone: 'gray' },
]

export const priorityRank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

export const priorityColor: Record<string, string> = { urgent: 'var(--bad)', high: 'var(--warn)', medium: 'var(--info)', low: 'var(--text-3)' }

export const repeatOptions: Option[] = [
  { value: '', label: 'Не повторять' },
  { value: 'daily', label: 'Каждый день' },
  { value: 'weekdays', label: 'По будням' },
  { value: 'weekly', label: 'По дням недели' },
  { value: 'monthly', label: 'Каждый месяц' },
  { value: 'yearly', label: 'Каждый год' },
  { value: 'interval', label: 'Каждые N дней' },
]
