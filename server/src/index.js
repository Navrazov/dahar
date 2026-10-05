import { config } from './config.js'
import { createApp } from './app.js'
import { dbLabel } from './db/pool.js'
import { migrate } from './db/migrations.js'
import { startScheduler } from './jobs/scheduler.js'
import { ensureBootstrapAdmin } from './modules/admin/admin.repository.js'
import { storageLabel } from './modules/files/files.storage.js'
import { initMonitoring, reportError } from './modules/monitoring/monitoring.js'
import { startBot } from './modules/telegram/bot.js'

await initMonitoring()
await migrate()

const admin = await ensureBootstrapAdmin()
if (admin) console.log(`Admin "${admin.login}" created from ADMIN_LOGIN / ADMIN_PASSWORD`)

createApp().listen(config.port, () => console.log(`Dahar: http://localhost:${config.port} (db: ${dbLabel}, files: ${storageLabel()})`))

startScheduler()
startBot({ token: config.telegram.token })

process.on('unhandledRejection', (e) => reportError(e, { source: 'unhandledRejection' }))
