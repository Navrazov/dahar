import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { pool, query, tx } from '../db/pool.ts'
import { reportError } from '../modules/monitoring/monitoring.ts'

/** Claim quickly, send without a transaction, then commit only our own lease. */
export async function deliver(userId: number, key: string, channel: string, at: Date, send: (client: PoolClient) => Promise<boolean>) {
  const token = randomUUID()
  const claim = await tx(async (c) => {
    await query(
      `INSERT INTO notification_deliveries(user_id,key,channel,next_attempt_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [userId, key, channel, at],
      c,
    )
    const row = (await query('SELECT * FROM notification_deliveries WHERE user_id=$1 AND key=$2 AND channel=$3 FOR UPDATE', [userId, key, channel], c)).rows[0]
    if (row.delivered_at) return { delivered: true, attempts: row.attempts }
    if (row.attempts >= 5 || row.next_attempt_at > at) return null
    await query(
      `UPDATE notification_deliveries SET claim_token=$4,attempts=attempts+1,next_attempt_at=$5::timestamptz+interval '5 minutes' WHERE user_id=$1 AND key=$2 AND channel=$3`,
      [userId, key, channel, token, at],
      c,
    )
    return { delivered: false, attempts: row.attempts }
  })
  if (!claim) return false
  if (claim.delivered) return true
  let ok = false
  let failure: string | null = null
  const connection = await pool.connect()
  try {
    ok = await send(connection)
  } catch (e) {
    failure = String((e as Error).message || 'Ошибка доставки')
      .replace(/https?:\/\/[^\s]+/g, '[URL]')
      .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, '[token]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [token]')
      .slice(0, 500)
    reportError(new Error(failure), { userId, channel, operation: 'notification_delivery' })
  } finally {
    connection.release()
  }
  const result = await query(
    `UPDATE notification_deliveries SET claim_token=NULL,
    delivered_at=CASE WHEN $4 THEN $5::timestamptz ELSE NULL END,
    next_attempt_at=$5::timestamptz+make_interval(secs=>$6),
    last_error=CASE WHEN $4 THEN NULL ELSE $8 END
    WHERE user_id=$1 AND key=$2 AND channel=$3 AND claim_token=$7`,
    [userId, key, channel, ok, at, 60 * 2 ** claim.attempts, token, failure ?? 'Канал не подтвердил доставку'],
  )
  return ok && !!result.rowCount
}
