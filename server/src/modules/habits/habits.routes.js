import { Router } from 'express'
import { badRequest, notFound } from '../../lib/errors.js'
import { isDate } from '../../lib/time.js'
import { getRow } from '../records/records.repository.js'
import { setHabitLog } from './habits.repository.js'

export function habitsRoutes() {
  const r = Router()

  r.put('/', async (req, res) => {
    const { habit_id, date, status } = req.body || {}
    if (!habit_id || !isDate(date)) throw badRequest('Нужны habit_id и date')
    if (!(await getRow('habits', habit_id, req.user.id))) throw notFound('Привычка не найдена')
    await setHabitLog(req.user.id, habit_id, date, status)
    res.json({ ok: true })
  })

  return r
}
