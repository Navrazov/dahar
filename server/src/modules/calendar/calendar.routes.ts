import { Router } from 'express'
import { query } from '../../db/pool.ts'
import { DEFAULT_TZ, isValidTz } from '../../lib/time.ts'
import { getSetting } from '../settings/settings.repository.ts'
import { createRecord, updateRecord } from '../records/records.service.ts'
import { operation } from '../history/operation.ts'
import { exportCalendar, parseCalendar } from './ical.ts'
import { decode } from '../../db/codec.ts'

export function calendarRoutes() {
  const r = Router()
  const zoneFor = async (userId: number) => {
    const zone = await getSetting(userId, 'timezone')
    return isValidTz(zone) ? zone : DEFAULT_TZ
  }
  r.get('/export', async (req, res) => {
    const rows = (await query('SELECT * FROM events WHERE user_id=$1 ORDER BY start,id', [req.user.id])).rows
    res
      .type('text/calendar')
      .attachment('dahar-calendar.ics')
      .send(exportCalendar(rows.map(decode) as Parameters<typeof exportCalendar>[0], await zoneFor(req.user.id)))
  })
  r.post('/preview', async (req, res) => res.json({ events: parseCalendar(req.body?.data, await zoneFor(req.user.id)) }))
  r.post('/import', async (req, res) => {
    await operation(req, res, 'Импорт календаря', async (c) => {
      const events = parseCalendar(req.body?.data, await zoneFor(req.user.id))
      let created = 0
      let updated = 0
      for (const event of events) {
        const existing = (await query('SELECT id FROM events WHERE user_id=$1 AND external_uid=$2', [req.user.id, event.external_uid], c)).rows[0]
        if (existing) {
          await updateRecord('events', existing.id, event, req.user.id, c)
          updated++
        } else {
          await createRecord('events', event, req.user.id, c)
          created++
        }
      }
      return { created, updated }
    })
  })
  return r
}
