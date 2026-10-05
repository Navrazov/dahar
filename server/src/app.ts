import express from 'express'
import type { Generate } from './modules/insights/insights.service.ts'
import { apiNotFound, errorHandler, jsonBody, jsonOnly, securityHeaders } from './http/middleware.ts'
import { mountFrontends } from './http/static.ts'
import { adminRoutes } from './modules/admin/admin.routes.ts'
import { loadUser, requireUser } from './modules/auth/auth.middleware.ts'
import { authRoutes } from './modules/auth/auth.routes.ts'
import { backupRoutes } from './modules/backup/backup.routes.ts'
import { filesRoutes } from './modules/files/files.routes.ts'
import { financeRoutes } from './modules/finance/finance.routes.ts'
import { habitsRoutes } from './modules/habits/habits.routes.ts'
import { monitoringRoutes } from './modules/monitoring/monitoring.routes.ts'
import { insightsRoutes } from './modules/insights/insights.routes.ts'
import { pushRoutes } from './modules/push/push.routes.ts'
import { recordsRoutes } from './modules/records/records.routes.ts'
import { searchRoutes } from './modules/search/search.routes.ts'
import { settingsRoutes } from './modules/settings/settings.routes.ts'
import { telegramRoutes } from './modules/telegram/telegram.routes.ts'
import { webAppRoutes } from './modules/telegram/webapp.ts'

export interface AppOptions {
  /** Подмена модели для разбора недели — в тестах. */
  generateInsight?: Generate
}

export function createApp(opts: AppOptions = {}) {
  const app = express()
  app.set('trust proxy', 1)
  app.disable('x-powered-by')
  app.use(securityHeaders)
  app.use(jsonBody)

  const api = express.Router()
  api.use(jsonOnly)
  api.get('/health', (_req, res) => res.json({ ok: true }))
  api.use('/admin', adminRoutes())

  api.use(loadUser)
  api.use(monitoringRoutes())
  api.use('/auth', authRoutes())
  api.use(webAppRoutes())

  api.use(requireUser)
  api.use('/telegram', telegramRoutes())
  api.use('/files', filesRoutes())
  api.use('/finance', financeRoutes())
  api.use('/habit-log', habitsRoutes())
  api.use('/settings', settingsRoutes())
  api.use('/search', searchRoutes())
  api.use('/push', pushRoutes())
  api.use('/insights', insightsRoutes(opts.generateInsight))
  api.use(backupRoutes())
  api.use(recordsRoutes())
  api.use(apiNotFound)

  app.use('/api', api)
  mountFrontends(app)
  app.use(errorHandler)

  return app
}
