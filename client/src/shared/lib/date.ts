import { addDays, differenceInCalendarDays, format, isValid, parseISO, startOfISOWeek, startOfMonth, subMonths } from 'date-fns'
import { ru } from 'date-fns/locale'

let accountTimezone = 'Europe/Moscow'
export const setAccountTimezone = (timezone?: string | null) => {
  const next = timezone || 'Europe/Moscow'
  try {
    new Intl.DateTimeFormat('en', { timeZone: next })
    accountTimezone = next
  } catch {
    /* reject invalid saved zones */
  }
}
/** Calendar wall time; never use this Date for elapsed time or UTC serialization. */
export function accountNow(instant = new Date()): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: accountTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  )
  return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`)
}

export const todayStr = () => format(accountNow(), 'yyyy-MM-dd')
export const ymd = (d: Date) => format(d, 'yyyy-MM-dd')
export const nowLocal = () => format(accountNow(), "yyyy-MM-dd'T'HH:mm")

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
  const diff = differenceInCalendarDays(d, accountNow())
  if (diff === 0) return 'Сегодня'
  if (diff === 1) return 'Завтра'
  if (diff === -1) return 'Вчера'
  return format(d, d.getFullYear() === accountNow().getFullYear() ? 'd MMM' : 'd MMM yyyy', { locale: ru })
}

export function daysLeft(s: string | null | undefined): number | null {
  const d = parse(s)
  return d ? differenceInCalendarDays(d, accountNow()) : null
}

export const monthKey = (d: string | null | undefined) => (d || '').slice(0, 7)

export function lastMonths(n: number): { key: string; label: string }[] {
  const now = startOfMonth(accountNow())
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
