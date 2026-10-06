import { query } from '../db/pool.ts'
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
  await query("DELETE FROM rate_limits WHERE expires_at < now() - interval '1 day'")
  await query("DELETE FROM request_operations WHERE created_at < now() - interval '30 days'")
  await query("DELETE FROM notification_deliveries WHERE next_attempt_at < now() - interval '30 days'")
  await query("DELETE FROM history_actions WHERE created_at < now() - interval '90 days'")
  await query("DELETE FROM ai_runs WHERE created_at < now() - interval '90 days'")
  await query('DELETE FROM ai_generation_locks WHERE expires_at < now()')
  await query('DELETE FROM behavior_daily WHERE day < current_date - 400')
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
