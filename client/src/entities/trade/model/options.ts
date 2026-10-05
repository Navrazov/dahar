import type { Option } from '@/shared/lib'

export const directions: Option[] = [
  { value: 'long', label: 'Long', tone: 'good' },
  { value: 'short', label: 'Short', tone: 'bad' },
]

export const topicStatuses: Option[] = [
  { value: 'todo', label: 'Не начато', tone: 'gray' },
  { value: 'learning', label: 'Изучаю', tone: 'info' },
  { value: 'done', label: 'Изучено', tone: 'good' },
]
