import { Router } from 'express'
import { query } from '../../db/pool.ts'

/** Read-only after expiry is a release decision; the pilot never locks users out of their data. */
export function subscriptionRoutes() {
  const r = Router()
  r.get('/', async (req, res) => {
    const row = (
      await query(`SELECT u.trial_ends_at,s.paid_until,s.cancel_at_period_end FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id WHERE u.id=$1`, [
        req.user.id,
      ])
    ).rows[0]
    const now = Date.now()
    res.json({
      status:
        row.paid_until && new Date(row.paid_until).getTime() > now
          ? 'active'
          : row.trial_ends_at && new Date(row.trial_ends_at).getTime() > now
            ? 'trial'
            : row.trial_ends_at || row.paid_until
              ? 'expired'
              : 'pilot',
      trial_ends_at: row.trial_ends_at,
      paid_until: row.paid_until,
      cancel_at_period_end: row.cancel_at_period_end ?? true,
      monthly_rub: 299,
      yearly_rub: 2990,
      checkout_available: false,
    })
  })
  r.post('/cancel', async (req, res) => {
    await query('UPDATE subscriptions SET cancel_at_period_end=true,updated_at=now() WHERE user_id=$1', [req.user.id])
    res.json({ ok: true })
  })
  return r
}
