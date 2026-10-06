import { query } from '../../db/pool.ts'
import { like, pagination, searchTerm } from './admin.reporting.ts'

/** Same precedence as the customer subscription endpoint; expiry never implies blocked. */
export const subscriptionStatusSql = `CASE WHEN s.paid_until>now() THEN 'active' WHEN u.trial_ends_at>now() THEN 'trial' WHEN s.paid_until IS NOT NULL OR u.trial_ends_at IS NOT NULL THEN 'expired' ELSE 'pilot' END`

function userSearch(params: Record<string, unknown>, args: unknown[]) {
  const conditions: string[] = []
  if (searchTerm(params.q)) {
    args.push(like(params.q))
    conditions.push(`(u.login ILIKE $${args.length} OR u.name ILIKE $${args.length})`)
  }
  if (/^[1-9]\d*$/.test(String(params.user_id))) {
    args.push(String(params.user_id))
    conditions.push(`u.id=$${args.length}::bigint`)
  }
  return conditions
}

export async function subscriptionsPage(params: Record<string, unknown>) {
  const { limit, offset } = pagination(params)
  const args: unknown[] = []
  const conditions = userSearch(params, args)
  const from = 'FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id'
  if (['active', 'trial', 'expired', 'pilot'].includes(String(params.status))) {
    args.push(String(params.status))
    conditions.push(`(${subscriptionStatusSql})=$${args.length}`)
  }
  if (params.canceling === '1') conditions.push('s.paid_until>now() AND s.cancel_at_period_end=true')
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const [items, count, summary] = await Promise.all([
    query(
      `SELECT u.id AS user_id,u.login,u.name,u.blocked_at,u.trial_ends_at,s.paid_until,s.cancel_at_period_end,s.updated_at,${subscriptionStatusSql} AS status,
      (SELECT count(*)::int FROM payments p WHERE p.user_id=u.id AND p.status IN ('succeeded','partially_refunded','refunded')) AS paid_payments
      ${from} ${where} ORDER BY u.created_at DESC,u.id DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
      [...args, limit, offset],
    ),
    query(`SELECT count(*)::int AS total ${from} ${where}`, args),
    query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE status='active')::int AS active,count(*) FILTER(WHERE status='trial')::int AS trial,
      count(*) FILTER(WHERE status='expired')::int AS expired,count(*) FILTER(WHERE status='pilot')::int AS pilot,
      count(*) FILTER(WHERE status='active' AND cancel_at_period_end=true)::int AS canceling FROM (SELECT ${subscriptionStatusSql} AS status,s.cancel_at_period_end ${from}) x`),
  ])
  return { items: items.rows, total: count.rows[0].total, summary: summary.rows[0], limit, offset, checkout_available: false }
}

export async function paymentsPage(params: Record<string, unknown>) {
  const { limit, offset } = pagination(params)
  const args: unknown[] = []
  const conditions = userSearch(params, args)
  if (['pending', 'succeeded', 'failed', 'canceled', 'refunded', 'partially_refunded'].includes(String(params.status))) {
    args.push(String(params.status))
    conditions.push(`p.status=$${args.length}`)
  }
  if (['7', '30', '90'].includes(String(params.days))) {
    args.push(Number(params.days))
    conditions.push(`p.created_at>=now()-make_interval(days=>$${args.length})`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const from = 'FROM payments p LEFT JOIN users u ON u.id=p.user_id'
  const [items, count, money, statuses] = await Promise.all([
    query(
      `SELECT p.*,p.id::text AS id,u.login,u.name ${from} ${where} ORDER BY p.created_at DESC,p.id DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
      [...args, limit, offset],
    ),
    query(`SELECT count(*)::int AS total ${from} ${where}`, args),
    query(
      `SELECT p.currency,COALESCE(sum(p.amount) FILTER(WHERE p.status IN ('succeeded','partially_refunded','refunded')),0) AS gross,
      COALESCE(sum(p.refunded_amount) FILTER(WHERE p.status IN ('succeeded','partially_refunded','refunded')),0) AS refunded,
      COALESCE(sum(p.amount-p.refunded_amount) FILTER(WHERE p.status IN ('succeeded','partially_refunded','refunded')),0) AS net ${from} ${where} GROUP BY p.currency ORDER BY p.currency`,
      args,
    ),
    query(`SELECT p.status,count(*)::int AS count ${from} ${where} GROUP BY p.status ORDER BY p.status`, args),
  ])
  return { items: items.rows, total: count.rows[0].total, money: money.rows, statuses: statuses.rows, limit, offset, checkout_available: false }
}

export async function telegramPage(params: Record<string, unknown>) {
  const { limit, offset } = pagination(params)
  const args: unknown[] = []
  const conditions = ['u.telegram_chat_id IS NOT NULL', ...userSearch(params, args)]
  if (params.filter === 'miniapp') conditions.push('u.last_miniapp_at IS NOT NULL')
  if (params.filter === 'failed')
    conditions.push(
      "EXISTS(SELECT 1 FROM notification_deliveries d WHERE d.user_id=u.id AND d.channel='telegram' AND d.delivered_at IS NULL AND d.attempts>=5)",
    )
  const where = `WHERE ${conditions.join(' AND ')}`
  const [items, count, summary] = await Promise.all([
    query(
      `SELECT u.id AS user_id,u.login,u.name,u.telegram_chat_id::text AS chat_id,u.blocked_at,u.last_seen_at,u.last_miniapp_at,
      (SELECT created_at FROM product_events e WHERE e.user_id=u.id AND e.event='telegram_linked') AS linked_at,
      (SELECT count(*)::int FROM notification_deliveries d WHERE d.user_id=u.id AND d.channel='telegram' AND d.delivered_at IS NULL AND d.attempts>=5) AS failed,
      (SELECT max(delivered_at) FROM notification_deliveries d WHERE d.user_id=u.id AND d.channel='telegram') AS last_delivered_at
      FROM users u ${where} ORDER BY u.created_at DESC,u.id DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
      [...args, limit, offset],
    ),
    query(`SELECT count(*)::int AS total FROM users u ${where}`, args),
    query(`SELECT count(*) FILTER(WHERE telegram_chat_id IS NOT NULL)::int AS linked,
      count(*) FILTER(WHERE telegram_chat_id IS NOT NULL AND last_miniapp_at IS NOT NULL)::int AS miniapp,
      count(*) FILTER(WHERE telegram_chat_id IS NOT NULL AND last_miniapp_at>=now()-interval '7 days')::int AS miniapp7,
      (SELECT count(DISTINCT user_id) FROM notification_deliveries WHERE channel='telegram' AND delivered_at IS NULL AND attempts>=5)::int AS affected FROM users`),
  ])
  return { items: items.rows, total: count.rows[0].total, summary: summary.rows[0], limit, offset }
}

export async function deliveriesPage(params: Record<string, unknown>) {
  const { limit, offset } = pagination(params)
  const args: unknown[] = []
  const conditions = userSearch(params, args)
  if (params.channel === 'telegram' || params.channel === 'push') {
    if (params.channel === 'push') conditions.push(`(d.channel='push' OR d.channel LIKE 'push-device:%')`)
    else {
      args.push(params.channel)
      conditions.push(`d.channel=$${args.length}`)
    }
  }
  const status: Record<string, string> = {
    failed: 'd.delivered_at IS NULL AND d.attempts>=5',
    pending: 'd.delivered_at IS NULL AND d.attempts<5',
    delivered: 'd.delivered_at IS NOT NULL',
  }
  if (status[String(params.status)]) conditions.push(status[String(params.status)])
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const from = 'FROM notification_deliveries d JOIN users u ON u.id=d.user_id'
  const [items, count] = await Promise.all([
    query(
      `SELECT d.user_id,u.login,u.name,d.key,d.channel,d.attempts,d.delivered_at,d.next_attempt_at,d.last_error ${from} ${where} ORDER BY d.next_attempt_at DESC,d.user_id,d.key,d.channel LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
      [...args, limit, offset],
    ),
    query(`SELECT count(*)::int AS total ${from} ${where}`, args),
  ])
  return { items: items.rows, total: count.rows[0].total, limit, offset }
}

export async function aiRunsPage(params: Record<string, unknown>) {
  const { limit, offset } = pagination(params)
  const args: unknown[] = []
  const conditions = ["r.created_at>=now()-interval '30 days'", ...userSearch(params, args)]
  if (['done', 'failed', 'pending'].includes(String(params.status))) {
    args.push(params.status)
    conditions.push(`r.status=$${args.length}`)
  }
  const where = `WHERE ${conditions.join(' AND ')}`
  const from = 'FROM ai_runs r JOIN users u ON u.id=r.user_id'
  const [items, count, summary] = await Promise.all([
    query(
      `SELECT r.user_id,u.login,u.name,r.key,r.week_start,r.status,r.model,r.input_tokens,r.output_tokens,r.cost_usd,r.duration_ms,r.created_at,r.last_error ${from} ${where} ORDER BY r.created_at DESC,r.user_id,r.key LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
      [...args, limit, offset],
    ),
    query(`SELECT count(*)::int AS total ${from} ${where}`, args),
    query(
      `SELECT count(*)::int AS requests,count(*) FILTER(WHERE r.status='failed')::int AS failed,
      count(*) FILTER(WHERE r.status='done' AND r.cost_usd IS NULL)::int AS unpriced,COALESCE(sum(r.cost_usd),0) AS known_cost_usd,
      COALESCE(sum(r.input_tokens),0) AS input_tokens,COALESCE(sum(r.output_tokens),0) AS output_tokens ${from} ${where}`,
      args,
    ),
  ])
  return { items: items.rows, total: count.rows[0].total, summary: summary.rows[0], limit, offset }
}
