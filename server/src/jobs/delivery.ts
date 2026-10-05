import type { PoolClient } from 'pg'
import { query, tx } from '../db/pool.ts'

/** Each channel has its own receipt. Successful channels are not repeated after a partial failure. */
export async function deliver(userId: number, key: string, channel: string, at: Date, send: (client: PoolClient) => Promise<boolean>) {
  return tx(async (c) => {
    await query('SELECT pg_advisory_xact_lock($1,$2)', [7262005, userId], c)
    await query(
      `INSERT INTO notification_deliveries(user_id,key,channel,next_attempt_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [userId, key, channel, at],
      c,
    )
    const row = (await query('SELECT * FROM notification_deliveries WHERE user_id=$1 AND key=$2 AND channel=$3 FOR UPDATE', [userId, key, channel], c)).rows[0]
    if (row.delivered_at) return true
    if (row.attempts >= 5 || row.next_attempt_at > at) return false
    let ok = false
    try {
      ok = await send(c)
    } catch (e) {
      console.error('Notification delivery failed:', (e as Error).message)
    }
    await query(
      `UPDATE notification_deliveries SET attempts=attempts+1,delivered_at=CASE WHEN $4 THEN $5::timestamptz ELSE NULL END,
      next_attempt_at=$5::timestamptz + make_interval(secs => $6) WHERE user_id=$1 AND key=$2 AND channel=$3`,
      [userId, key, channel, ok, at, 60 * 2 ** row.attempts],
      c,
    )
    return ok
  })
}
