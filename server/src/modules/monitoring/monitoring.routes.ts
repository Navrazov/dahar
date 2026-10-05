import { Router } from 'express'
import { createLimiter } from '../../lib/rate-limit.ts'
import { reportClientError } from './monitoring.ts'

const limiter = createLimiter({ max: 30, windowMs: 10 * 60_000 })

export function monitoringRoutes() {
  const r = Router()

  r.post('/client-errors', (req, res) => {
    if (limiter.hit(String(req.ip))) return res.status(429).end()
    const { message, stack, url, component } = req.body ?? {}
    reportClientError({ message, stack, url, component, agent: req.headers['user-agent'], user: req.user })
    res.status(204).end()
  })

  return r
}
