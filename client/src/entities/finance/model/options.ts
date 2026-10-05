import type { Option } from '@/shared/lib'

export const accountKinds: Option[] = [
  { value: 'card', label: 'Карта' },
  { value: 'cash', label: 'Наличные' },
  { value: 'savings', label: 'Накопления' },
  { value: 'investment', label: 'Инвестиции' },
]

export const txnKinds: Option[] = [
  { value: 'expense', label: 'Расход', tone: 'bad' },
  { value: 'income', label: 'Доход', tone: 'good' },
  { value: 'transfer', label: 'Перевод', tone: 'info' },
]
