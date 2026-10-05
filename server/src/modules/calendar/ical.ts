import { badRequest } from '../../lib/errors.ts'
import { addDays, isDate, isValidTz, nowIn } from '../../lib/time.ts'

export interface CalendarEvent {
  title: string
  description: string
  start: string
  end: string | null
  all_day: boolean
  external_uid: string
}
const unescapeText = (s: string) => s.replace(/\\([nN,;\\])/g, (_, c: string) => (c.toLowerCase() === 'n' ? '\n' : c))
const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')

/** Convert a wall-clock time in a named IANA zone; reject nonexistent DST times. */
export function wallToUtc(stamp: string, zone: string) {
  const wall = new Date(stamp + 'Z').getTime()
  if (!Number.isFinite(wall) || !isValidTz(zone)) throw badRequest('Неизвестный часовой пояс или дата календаря')
  let guess = wall
  for (let i = 0; i < 4; i++) {
    const local = nowIn(zone, new Date(guess)).stamp
    const delta = wall - new Date(local + ':00Z').getTime()
    if (!delta) break
    guess += delta
  }
  if (nowIn(zone, new Date(guess)).stamp !== stamp.slice(0, 16)) throw badRequest('Время события не существует при переводе часов')
  return new Date(guess)
}
function parseDate(raw: string, zone: string, targetZone: string) {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(raw)
  if (!match) throw badRequest('Неизвестный формат даты в календаре')
  const [, y, m, d, h, minute, second, z] = match
  const day = `${y}-${m}-${d}`
  if (!isDate(day) || (h !== undefined && (+h > 23 || +minute > 59 || +(second ?? 0) > 59))) throw badRequest('Некорректная дата календаря')
  if (h === undefined) return { stamp: day + 'T00:00', allDay: true }
  const stamp = `${day}T${h}:${minute}`
  return {
    stamp: z ? nowIn(targetZone, new Date(stamp + ':00Z')).stamp : zone === targetZone ? stamp : nowIn(targetZone, wallToUtc(stamp, zone)).stamp,
    allDay: false,
  }
}
export function parseCalendar(data: unknown, targetZone: string): CalendarEvent[] {
  if (typeof data !== 'string' || Buffer.byteLength(data) > 900000) throw badRequest('Выберите файл ICS размером до 900 КБ')
  const lines = data
    .replace(/^\uFEFF/, '')
    .replace(/\r?\n[ \t]/g, '')
    .split(/\r?\n/)
  if (lines[0]?.trim() !== 'BEGIN:VCALENDAR' || !lines.some((l) => l.trim() === 'END:VCALENDAR')) throw badRequest('Это не календарь ICS')
  const events: CalendarEvent[] = []
  const uids = new Set<string>()
  let props: Map<string, { value: string; params: string }> | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      if (props) throw badRequest('Повреждён календарь')
      props = new Map()
      continue
    }
    if (line === 'END:VEVENT') {
      if (!props) throw badRequest('Повреждён календарь')
      if (['RRULE', 'RDATE', 'EXDATE', 'RECURRENCE-ID'].some((k) => props!.has(k)))
        throw badRequest('Повторяющиеся события пока не поддерживаются. Экспортируйте отдельные события')
      const uid = props.get('UID')?.value
      const start = props.get('DTSTART')
      const end = props.get('DTEND')
      if (!uid || uid.length > 500 || /[\r\n]/.test(uid) || uids.has(uid) || !start) throw badRequest('События должны иметь уникальный UID и дату начала')
      const zoneOf = (p: { params: string }) => {
        const zone = /TZID=(?:"([^"]+)"|([^;]+))/i.exec(p.params)
        return zone?.[1] ?? zone?.[2] ?? targetZone
      }
      const a = parseDate(start.value, zoneOf(start), targetZone)
      const b = end ? parseDate(end.value, zoneOf(end), targetZone) : null
      if (b && (a.allDay !== b.allDay || b.stamp <= a.stamp)) throw badRequest('Некорректное окончание события')
      if (!b && props.has('DURATION')) throw badRequest('Событие с DURATION: экспортируйте календарь с датой окончания DTEND')
      const title = unescapeText(props.get('SUMMARY')?.value ?? '').trim() || 'Без названия'
      const description = unescapeText(props.get('DESCRIPTION')?.value ?? '')
      if (title.length > 200 || description.length > 20000) throw badRequest('Слишком длинное название или описание события')
      // Dahar stores the final included day; ICS uses an exclusive end date.
      events.push({
        title,
        description,
        start: a.stamp,
        end: b ? (a.allDay ? addDays(b.stamp.slice(0, 10), -1) + 'T00:00' : b.stamp) : null,
        all_day: a.allDay,
        external_uid: uid,
      })
      uids.add(uid)
      props = null
      if (events.length > 1000) throw badRequest('За один раз можно импортировать до 1000 событий')
      continue
    }
    if (props) {
      const colon = line.indexOf(':')
      if (colon < 0) continue
      const head = line.slice(0, colon)
      const [name, ...params] = head.split(';')
      const key = name.toUpperCase()
      if (props.has(key) && ['DTSTART', 'DTEND', 'UID', 'SUMMARY'].includes(key)) throw badRequest('Повреждённое событие')
      props.set(key, { value: line.slice(colon + 1), params: params.join(';') })
    }
  }
  if (props || !events.length) throw badRequest('В календаре нет завершённых событий')
  return events
}
function fold(line: string) {
  const chunks: string[] = []
  let part = ''
  let bytes = 0
  for (const char of line) {
    const size = Buffer.byteLength(char)
    if (bytes + size > 75) {
      chunks.push(part)
      part = ' ' + char
      bytes = 1 + size
    } else {
      part += char
      bytes += size
    }
  }
  chunks.push(part)
  return chunks.join('\r\n')
}
export function exportCalendar(events: (Omit<CalendarEvent, 'external_uid'> & { id: number; external_uid?: string | null })[], zone: string) {
  const utc = (stamp: string) => wallToUtc(stamp.slice(0, 16), zone).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dahar//Calendar//RU', 'CALSCALE:GREGORIAN']
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.external_uid || `event-${e.id}@dahar`}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `SUMMARY:${escapeText(e.title)}`,
      `DESCRIPTION:${escapeText(e.description || '')}`,
    )
    if (e.all_day) {
      lines.push(
        `DTSTART;VALUE=DATE:${e.start.slice(0, 10).replaceAll('-', '')}`,
        `DTEND;VALUE=DATE:${addDays((e.end || e.start).slice(0, 10), 1).replaceAll('-', '')}`,
      )
    } else {
      lines.push(`DTSTART:${utc(e.start)}`)
      if (e.end) lines.push(`DTEND:${utc(e.end)}`)
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
