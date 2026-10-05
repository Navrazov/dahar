import { formatDistanceToNowStrict, format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'

const nf = new Intl.NumberFormat('ru-RU')

export const num = (v: number | null | undefined) => (v == null ? '—' : nf.format(v))

export const pct = (v: number) => `${Math.round(v * 100)}%`

export function bytes(n: number) {
  if (!n) return '0 Б'
  const units = ['Б', 'КБ', 'МБ', 'ГБ']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0).replace('.', ',')} ${units[i]}`
}

export const dateTime = (s: string | null | undefined) => (s ? format(parseISO(s), 'd MMM yyyy, HH:mm', { locale: ru }) : '—')

export const date = (s: string | null | undefined) => (s ? format(parseISO(s), 'd MMM yyyy', { locale: ru }) : '—')

export const shortDay = (s: string) => format(parseISO(s), 'd MMM', { locale: ru })

export const ago = (s: string | null | undefined) => (s ? `${formatDistanceToNowStrict(parseISO(s), { locale: ru, addSuffix: true })}` : 'никогда')

export function duration(sec: number) {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return [d && `${d} д`, h && `${h} ч`, `${m} мин`].filter(Boolean).join(' ')
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}
