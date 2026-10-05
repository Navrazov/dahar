import { userSessions } from '../modules/auth/user-sessions.js'
import { adminSessions } from '../modules/admin/admin.sessions.js'
import { cleanupOrphanFiles } from '../modules/files/files.storage.js'
import { cleanupErrorLog, reportError } from '../modules/monitoring/monitoring.js'
import { botEnabled } from '../modules/telegram/transport.js'
import { sendDigests } from './digest.js'
import { sendReminders } from './reminders.js'

const state = { startedAt: null, lastTickAt: null, ticks: 0 }

export const schedulerState = () => ({ ...state })

async function hourly() {
  await userSessions.cleanup()
  await adminSessions.cleanup()
  await cleanupOrphanFiles()
  await cleanupErrorLog()
}

async function tick() {
  state.ticks++
  state.lastTickAt = new Date().toISOString()
  try {
    if (botEnabled()) {
      await sendReminders()
      await sendDigests()
    }
    if (state.ticks % 60 === 1) await hourly()
  } catch (e) {
    reportError(e, { source: 'scheduler' })
  }
}

export function startScheduler() {
  state.startedAt = new Date().toISOString()
  tick()
  setInterval(tick, 60_000).unref()
}
