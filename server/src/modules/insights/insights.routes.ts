import { limitUsage } from '../../lib/rate-limit.ts'
import { Router } from 'express'
import { badRequest, HttpError } from '../../lib/errors.ts'
import { isDate, weekday } from '../../lib/time.ts'
import { createInsight, getInsight, insightsEnabled, type Generate } from './insights.service.ts'

const weekStartOf = (v: unknown) => {
  if (!isDate(v) || weekday(v) !== 1) throw badRequest('week: ожидается понедельник в формате ГГГГ-ММ-ДД')
  return v
}

export function insightsRoutes(generate?: Generate) {
  const r = Router()

  r.get('/', async (req, res) => {
    const week = weekStartOf(req.query.week)
    const max = Number(process.env.AI_MONTHLY_LIMIT || 4)
    const used = await limitUsage('insight-month', String(req.user.id) + ':' + new Date().toISOString().slice(0, 7))
    res.json({ quota: { max, remaining: Math.max(0, max - used) }, enabled: insightsEnabled() || !!generate, insight: await getInsight(req.user.id, week) })
  })

  r.post('/', async (req, res) => {
    if (!insightsEnabled() && !generate) throw new HttpError(503, 'Разбор недели не настроен на сервере (ANTHROPIC_API_KEY)')
    res.json(await createInsight(req.user.id, weekStartOf(req.body?.week), generate, req.get('Idempotency-Key')))
  })

  return r
}
