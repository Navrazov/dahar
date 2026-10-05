import { config } from '../config.js'

export const DEFAULT_TZ = config.defaultTz

export function isValidTz(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function nowIn(tz = DEFAULT_TZ, at = new Date()) {
  const zone = isValidTz(tz) ? tz : DEFAULT_TZ
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  )
  const date = `${parts.year}-${parts.month}-${parts.day}`
  const time = `${parts.hour}:${parts.minute}`
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1
  return { date, time, hour: Number(parts.hour), weekday, stamp: `${date}T${time}` }
}

const toUtc = (d) => new Date(`${d}T00:00:00Z`)
const fromUtc = (d) => d.toISOString().slice(0, 10)

export function addDays(date, n) {
  const d = toUtc(date)
  d.setUTCDate(d.getUTCDate() + n)
  return fromUtc(d)
}

export function addMonths(date, n) {
  const d = toUtc(date)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + n)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return fromUtc(d)
}

export function weekday(date) {
  const w = toUtc(date).getUTCDay()
  return w === 0 ? 7 : w
}

export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
