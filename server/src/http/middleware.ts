import express, { type NextFunction, type Request, type Response } from 'express'
import { config } from '../config.ts'
import { reportError } from '../modules/monitoring/monitoring.ts'

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://*.sentry.io",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

// Мини-приложение Telegram: открывается во фрейме Telegram Web/Desktop и грузит их скрипт.
const miniAppCsp = csp
  .replace("script-src 'self'", "script-src 'self' https://telegram.org")
  .replace("frame-ancestors 'none'", 'frame-ancestors https://web.telegram.org https://*.telegram.org')

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  const miniApp = req.path === '/tg' || req.path.startsWith('/tg/')
  res.setHeader('Content-Security-Policy', miniApp ? miniAppCsp : csp)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (!miniApp) res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
  if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
}

/** Большие тела нужны только загрузке файлов, выписок и восстановлению копии. */
const BIG_BODY = /^\/api\/(files|restore|finance\/import)(\/|$)/
const smallJson = express.json({ limit: '1mb' })
const bigJson = express.json({ limit: '25mb' })

export function jsonBody(req: Request, res: Response, next: NextFunction) {
  return (BIG_BODY.test(req.path) ? bigJson : smallJson)(req, res, next)
}

export function jsonOnly(req: Request, res: Response, next: NextFunction) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) return res.status(415).json({ error: 'Ожидается JSON' })
  next()
}

export function apiNotFound(_req: Request, res: Response) {
  res.status(404).json({ error: 'Не найдено' })
}

interface HttpLikeError extends Error {
  status?: number
  type?: string
}

export function errorHandler(err: HttpLikeError, req: Request, res: Response, _next: NextFunction) {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Неверный JSON' })
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Слишком большой запрос' })
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message })
  reportError(err, { method: req.method, path: req.path, user: req.user?.login, userId: req.user?.id })
  res.status(500).json({ error: 'Внутренняя ошибка сервера' })
}
