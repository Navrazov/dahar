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
    res.json({ ok: true })
  })
  return r
}
