import express from 'express'
import { apiNotFound, errorHandler, jsonOnly, securityHeaders } from './http/middleware.js'
import { mountFrontends } from './http/static.js'
import { adminRoutes } from './modules/admin/admin.routes.js'
import { loadUser, requireUser } from './modules/auth/auth.middleware.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { backupRoutes } from './modules/backup/backup.routes.js'
import { filesRoutes } from './modules/files/files.routes.js'
import { financeRoutes } from './modules/finance/finance.routes.js'
import { habitsRoutes } from './modules/habits/habits.routes.js'
import { monitoringRoutes } from './modules/monitoring/monitoring.routes.js'
import { recordsRoutes } from './modules/records/records.routes.js'
import { settingsRoutes } from './modules/settings/settings.routes.js'
import { telegramRoutes } from './modules/telegram/telegram.routes.js'

export function createApp() {
  const app = express()
  app.set('trust proxy', 1)
  app.use(express.json({ limit: '25mb' }))
  app.use(securityHeaders)

  const api = express.Router()
  api.use(jsonOnly)
  api.get('/health', (_req, res) => res.json({ ok: true }))
  api.use('/admin', adminRoutes())

  api.use(loadUser)
  api.use(monitoringRoutes())
  api.use('/auth', authRoutes())

  api.use(requireUser)
  api.use('/telegram', telegramRoutes())
  api.use('/files', filesRoutes())
  api.use('/finance', financeRoutes())
  api.use('/habit-log', habitsRoutes())
  api.use('/settings', settingsRoutes())
  api.use(backupRoutes())
  api.use(recordsRoutes())
  api.use(apiNotFound)

  app.use('/api', api)
  mountFrontends(app)
  app.use(errorHandler)

  return app
}
