import { Router } from 'express'
import { createLimiter } from '../../lib/rate-limit.js'
import { reportClientError } from './monitoring.js'

const limiter = createLimiter({ max: 30, windowMs: 10 * 60_000 })

export function monitoringRoutes() {
  const r = Router()

  r.post('/client-errors', (req, res) => {
    if (limiter.hit(req.ip)) return res.status(429).end()
    reportClientError({ ...req.body, agent: req.headers['user-agent'], user: req.user })
    res.status(204).end()
  })

  return r
}
