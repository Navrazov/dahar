import type { Option } from '@/shared/lib'

export const partnerStatuses: Option[] = [
  { value: 'new', label: 'Новый', tone: 'gray' },
  { value: 'contact', label: 'Первый контакт', tone: 'info' },
  { value: 'negotiation', label: 'Переговоры', tone: 'accent' },
  { value: 'terms', label: 'Отправлены условия', tone: 'warn' },
  { value: 'first_client', label: 'Первый клиент', tone: 'info' },
  { value: 'active', label: 'Активный партнёр', tone: 'good' },
  { value: 'inactive', label: 'Неактивный', tone: 'bad' },
]

export const interactionTypes: Option[] = [
  { value: 'call', label: 'Звонок' },
  { value: 'meeting', label: 'Встреча' },
  { value: 'message', label: 'Сообщение' },
  { value: 'email', label: 'Email' },
  { value: 'other', label: 'Другое' },
]
