import type { Option } from '@/shared/lib'

export const projectStatuses: Option[] = [
  { value: 'idea', label: 'Идея', tone: 'gray' },
  { value: 'active', label: 'В работе', tone: 'accent' },
  { value: 'paused', label: 'На паузе', tone: 'warn' },
  { value: 'done', label: 'Завершён', tone: 'good' },
  { value: 'archived', label: 'Архив', tone: 'gray' },
]
