import { addDays, differenceInCalendarDays, format, isValid, parseISO, startOfISOWeek, startOfMonth, subMonths } from 'date-fns'
import { ru } from 'date-fns/locale'

export const todayStr = () => format(new Date(), 'yyyy-MM-dd')
export const ymd = (d: Date) => format(d, 'yyyy-MM-dd')
export const nowLocal = () => format(new Date(), "yyyy-MM-dd'T'HH:mm")

export function parse(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = parseISO(s)
  return isValid(d) ? d : null
}

export function fmtDate(s: string | null | undefined, pattern = 'd MMM'): string {
  const d = parse(s)
  return d ? format(d, pattern, { locale: ru }) : '—'
}

export function relDate(s: string | null | undefined): string {
  const d = parse(s)
  if (!d) return '—'
  const diff = differenceInCalendarDays(d, new Date())
  if (diff === 0) return 'Сегодня'
  if (diff === 1) return 'Завтра'
  if (diff === -1) return 'Вчера'
  return format(d, d.getFullYear() === new Date().getFullYear() ? 'd MMM' : 'd MMM yyyy', { locale: ru })
}

export function daysLeft(s: string | null | undefined): number | null {
  const d = parse(s)
  return d ? differenceInCalendarDays(d, new Date()) : null
}

export const monthKey = (d: string | null | undefined) => (d || '').slice(0, 7)

export function lastMonths(n: number): { key: string; label: string }[] {
  const now = startOfMonth(new Date())
  return Array.from({ length: n }, (_, i) => {
    const d = subMonths(now, n - 1 - i)
    return { key: format(d, 'yyyy-MM'), label: format(d, 'LLL', { locale: ru }).replace('.', '') }
  })
}

export function weekDays(anchor: Date): Date[] {
  const start = startOfISOWeek(anchor)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
