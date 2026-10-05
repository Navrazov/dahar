import type { Option } from '@/shared/lib'

export const contentStatuses: Option[] = [
  { value: 'idea', label: 'Идея', tone: 'gray' },
  { value: 'script', label: 'Сценарий', tone: 'info' },
  { value: 'filmed', label: 'Снято', tone: 'accent' },
  { value: 'edited', label: 'Смонтировано', tone: 'warn' },
  { value: 'published', label: 'Опубликовано', tone: 'good' },
]
