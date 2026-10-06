import { Router } from 'express'
import type { Db } from '../../db/pool.ts'
import { query } from '../../db/pool.ts'
import { badRequest } from '../../lib/errors.ts'

export const activationEvents = [
  'first_task',
  'first_completion',
  'first_habit',
  'telegram_linked',
  'weekly_review_opened',
  'first_review',
  'onboarding_completed',
] as const
export async function trackActivation(userId: number, event: (typeof activationEvents)[number], client?: Db) {
  await query('INSERT INTO product_events(user_id,event) VALUES($1,$2) ON CONFLICT DO NOTHING', [userId, event], client)
}
export function activationRoutes() {
  const r = Router()
  r.post('/', async (req, res) => {
    if (req.body?.event !== 'weekly_review_opened') throw badRequest('Неизвестное событие')
    await trackActivation(req.user.id, 'weekly_review_opened')
    await trackBehavior(req.user.id, 'review_opened')
    res.json({ ok: true })
  })
  return r
}

export async function trackBehavior(
  userId: number,
  event: 'task_created' | 'task_completed' | 'focus_selected' | 'habit_logged' | 'review_saved' | 'review_opened' | 'export',
  client?: Db,
) {
  await query(
    `INSERT INTO behavior_daily(user_id,day,event) VALUES($1,(now() AT TIME ZONE 'UTC')::date,$2)
    ON CONFLICT(user_id,day,event) DO UPDATE SET count=behavior_daily.count+1`,
    [userId, event],
    client,
  )
}
