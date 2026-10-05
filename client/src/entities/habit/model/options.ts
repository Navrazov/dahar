import type { Option } from '@/shared/lib'

export const habitKinds: Option[] = [
  { value: 'build', label: 'Сформировать (делать)' },
  { value: 'quit', label: 'Избавиться (не делать)' },
]

export const habitFrequencies: Option[] = [
  { value: 'daily', label: 'Каждый день' },
  { value: 'weekdays', label: 'По дням недели' },
  { value: 'weekly', label: 'N раз в неделю' },
]
