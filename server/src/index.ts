import type { Server } from 'node:http'
import { config } from './config.ts'
import { createApp } from './app.ts'
import { dbLabel, pool } from './db/pool.ts'
import { migrate } from './db/migrations.ts'
import { runAsLeader, type Leadership } from './jobs/leader.ts'
import { startScheduler } from './jobs/scheduler.ts'
import { ensureBootstrapAdmin } from './modules/admin/admin.repository.ts'
import { storageLabel } from './modules/files/files.storage.ts'
import { initMonitoring, reportError } from './modules/monitoring/monitoring.ts'
import { initPush } from './modules/push/push.service.ts'
import { startBot } from './modules/telegram/bot.ts'

await initMonitoring()
await migrate()
await initPush()

const admin = await ensureBootstrapAdmin()
if (admin) console.log(`Admin "${admin.login}" created from ADMIN_LOGIN / ADMIN_PASSWORD`)

const { role } = config
let server: Server | null = null
let jobs: Leadership | null = null

if (role !== 'worker') {
  server = createApp().listen(config.port, () => console.log(`Dahar ${role}: http://localhost:${config.port} (db: ${dbLabel}, files: ${storageLabel()})`))
}

if (role !== 'web') {
  jobs = runAsLeader(() => {
    const controller = new AbortController()
    const stopScheduler = startScheduler()
    startBot({ token: config.telegram.token, signal: controller.signal })
    return () => {
      controller.abort()
      stopScheduler()
    }
  })
}

process.on('unhandledRejection', (e) => reportError(e, { source: 'unhandledRejection' }))

/** Деплой присылает SIGTERM: дожидаемся текущих запросов, отпускаем блокировку и соединения. */
let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`${signal}: shutting down`)
  const force = setTimeout(() => process.exit(1), 10_000)
  force.unref()
  await Promise.all([server && new Promise((r) => server!.close(r)), jobs?.stop()])
  await pool.end().catch(() => {})
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
