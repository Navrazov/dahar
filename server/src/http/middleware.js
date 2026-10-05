import { reportError } from '../modules/monitoring/monitoring.js'

export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'")
  next()
}

export function jsonOnly(req, res, next) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) return res.status(415).json({ error: 'Ожидается JSON' })
  next()
}

export function apiNotFound(_req, res) {
  res.status(404).json({ error: 'Не найдено' })
}

export function errorHandler(err, req, res, _next) {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Неверный JSON' })
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message })
  reportError(err, { method: req.method, path: req.path, user: req.user?.login, userId: req.user?.id })
  res.status(500).json({ error: 'Внутренняя ошибка сервера' })
}
