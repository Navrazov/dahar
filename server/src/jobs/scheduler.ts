import { userSessions } from '../modules/auth/user-sessions.ts'
import { adminSessions } from '../modules/admin/admin.sessions.ts'
import { cleanupOrphanFiles } from '../modules/files/files.storage.ts'
import { cleanupErrorLog, reportError } from '../modules/monitoring/monitoring.ts'
import { sendDigests } from './digest.ts'
import { sendReminders } from './reminders.ts'

const state: { startedAt: string | null; lastTickAt: string | null; ticks: number; running: boolean } = {
  startedAt: null,
  lastTickAt: null,
  ticks: 0,
  running: false,
}

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
    // Каналы (Telegram, push) выбираются для каждого пользователя внутри.
    await sendReminders()
    await sendDigests()
    if (state.ticks % 60 === 1) await hourly()
  } catch (e) {
    reportError(e, { source: 'scheduler' })
  }
}

/** Запускает фоновые задачи раз в минуту. Возвращает функцию остановки. */
export function startScheduler() {
  state.startedAt = new Date().toISOString()
  state.running = true
  let active: Promise<void> | null = null
  const run = () => {
    if (!active)
      active = tick().finally(() => {
        active = null
      })
  }
  run()
  const timer = setInterval(run, 60_000)
  timer.unref()
  return async () => {
    clearInterval(timer)
    state.running = false
    await active
  }
}
