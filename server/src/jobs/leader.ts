import type { PoolClient } from 'pg'
import { pool } from '../db/pool.ts'

/** Номер блокировки «кто выполняет фоновые задачи». У миграций — свой. */
const WORKER_LOCK = 7_262_002
const RETRY_MS = 15_000

export interface Leadership {
  isLeader: () => boolean
  stop: () => Promise<void>
}

/**
 * Фоновые задачи (бот, напоминания, сводки) должны работать ровно в одном экземпляре.
 * Экземпляры соревнуются за сессионную блокировку Postgres; победитель запускает задачи.
 * Если его соединение рвётся или процесс падает, блокировка освобождается и её забирает другой.
 */
export function runAsLeader(start: () => () => void | Promise<void>, { retryMs = RETRY_MS, log = console.log } = {}): Leadership {
  let client: PoolClient | null = null
  let stopJobs: (() => void | Promise<void>) | null = null
  let stopped = false
  let timer: NodeJS.Timeout | null = null

  const release = async () => {
    if (stopJobs) {
      await stopJobs()
      stopJobs = null
      log('Background jobs stopped')
    }
    if (client) {
      client.release(true)
      client = null
    }
  }

  const attempt = async () => {
    if (stopped || stopJobs) return
    try {
      client ??= await pool.connect()
      client.on('error', async () => {
        await release()
        schedule()
      })
      const { rows } = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [WORKER_LOCK])
      if (rows[0].ok && !stopped) {
        log('This instance runs background jobs')
        stopJobs = start()
        return
      }
      client.release()
      client = null
    } catch (e) {
      console.error('Leader election failed:', (e as Error).message)
      if (client) client.release(true)
      client = null
    }
    schedule()
  }

  const schedule = () => {
    if (stopped) return
    timer = setTimeout(attempt, retryMs)
    timer.unref()
  }

  attempt()

  return {
    isLeader: () => stopJobs !== null,
    async stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      await release()
    },
  }
}
