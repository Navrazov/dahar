import { operation } from '../history/operation.ts'
import { Router } from 'express'
import { badRequest, notFound } from '../../lib/errors.ts'
import { isDate } from '../../lib/time.ts'
import { getRow } from '../records/records.repository.ts'
import { setHabitLog } from './habits.repository.ts'

export function habitsRoutes() {
  const r = Router()

  r.put('/', async (req, res) => {
    const { habit_id, date, status } = req.body || {}
    if (!habit_id || !isDate(date)) throw badRequest('Нужны habit_id и date')
    if (status != null && status !== 'done' && status !== 'slip') throw badRequest('status: done, slip или null')
    await operation(req, res, 'Отметка привычки', async (c) => {
      const habit = await getRow('habits', habit_id, req.user.id, c, true)
      if (!habit) throw notFound('Привычка не найдена')
      await setHabitLog(req.user.id, habit.id, date, status, c)
      return { ok: true }
    })
  })

  return r
}
