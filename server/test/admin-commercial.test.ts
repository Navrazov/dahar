import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { adminLogin, client, createUser, login, pool, query, resetDatabase, startApp, type App, type Client } from './helpers.ts'
import { createAdmin } from '../src/modules/admin/admin.repository.ts'
import { config } from '../src/config.ts'
import { deliver } from '../src/jobs/delivery.ts'

let app: App, admin: Client, alice: Client, aliceId: number, bobId: number
before(async () => {
  await resetDatabase()
  app = await startApp()
  await createAdmin('commercial-owner', 'commercial-password')
  aliceId = await createUser('commercial-alice')
  bobId = await createUser('commercial-bob')
  alice = await login(app.base, 'commercial-alice')
  admin = await adminLogin(app.base, 'commercial-owner', 'commercial-password')
})
after(async () => {
  await app.close()
  await pool.end()
})

test('commercial and delivery APIs remain admin-only and uncached', async () => {
  for (const path of ['/subscriptions', '/payments', '/telegram', '/deliveries', '/ai-runs']) {
    assert.equal((await client(app.base).get('/api/admin' + path)).status, 401)
    assert.equal((await alice.get('/api/admin' + path)).status, 401)
    const r = await fetch(app.base + '/api/admin' + path, { headers: { cookie: admin.cookie! } })
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('cache-control'), 'no-store')
  }
})
test('subscription dates have consistent precedence and paid expiry is not a pilot account', async () => {
  await query("UPDATE users SET trial_ends_at=now()+interval '14 days' WHERE id=$1", [aliceId])
  await query("INSERT INTO subscriptions(user_id,paid_until,cancel_at_period_end) VALUES($1,now()+interval '30 days',true),($2,now()-interval '1 day',true)", [
    aliceId,
    bobId,
  ])
  const r = (await admin.get('/api/admin/subscriptions')).body
  assert.equal(r.summary.active, 1)
  assert.equal(r.summary.expired, 1)
  assert.equal(r.summary.canceling, 1)
  assert.equal((await admin.get('/api/admin/subscriptions?status=active&limit=1')).body.items[0].user_id, aliceId)
  assert.equal((await admin.get(`/api/admin/subscriptions?user_id=${bobId}`)).body.items[0].status, 'expired')
  const bob = await login(app.base, 'commercial-bob')
  assert.equal((await bob.get('/api/subscription')).body.status, 'expired')
  assert.equal((await admin.get('/api/admin/subscriptions?q=%25')).body.total, 0)
  assert.equal((await admin.get('/api/admin/subscriptions?limit=99999&offset=-5')).body.limit, 100)
  await query('DELETE FROM subscriptions')
  await query('UPDATE users SET trial_ends_at=NULL')
})
test('payment totals exclude unpaid records, account for refunds and never mix currencies', async () => {
  await query(
    `INSERT INTO payments(user_id,provider,provider_payment_id,status,amount,currency,refunded_amount,paid_at) VALUES
    ($1,'test','rub-success','succeeded',299,'RUB',0,now()),
    ($1,'test','rub-partial','partially_refunded',299,'RUB',99,now()),
    ($1,'test','rub-refunded','refunded',299,'RUB',299,now()),
    ($1,'test','rub-failed','failed',299,'RUB',0,NULL),
    ($2,'test','usd-paid','succeeded',10,'USD',0,now())`,
    [aliceId, bobId],
  )
  const r = (await admin.get('/api/admin/payments?limit=2')).body
  assert.equal(r.total, 5)
  assert.equal(r.items.length, 2)
  assert.deepEqual(
    r.money.find((m) => m.currency === 'RUB'),
    { currency: 'RUB', gross: 897, refunded: 398, net: 499 },
  )
  assert.deepEqual(
    r.money.find((m) => m.currency === 'USD'),
    { currency: 'USD', gross: 10, refunded: 0, net: 10 },
  )
  const a = (await admin.get(`/api/admin/payments?user_id=${aliceId}&status=succeeded`)).body
  assert.equal(a.total, 1)
  assert.equal(a.money[0].net, 299)
  assert.equal((await admin.get('/api/admin/payments?status=DROP%20TABLE%20users&q=%25')).body.total, 0)
  await query('DELETE FROM payments')
})
test('payment history survives account deletion and provider records are unique', async () => {
  const id = await createUser('deleted-payer')
  await query("INSERT INTO payments(user_id,provider,provider_payment_id,status,amount,currency) VALUES($1,'test','retained','succeeded',299,'RUB')", [id])
  await assert.rejects(query("INSERT INTO payments(provider,provider_payment_id,status,amount,currency) VALUES('test','retained','succeeded',299,'RUB')"), {
    code: '23505',
  })
  await query('DELETE FROM users WHERE id=$1', [id])
  const r = (await admin.get('/api/admin/payments')).body.items[0]
  assert.equal(r.user_id, null)
  assert.equal(r.login, null)
  assert.equal(r.amount, 299)
  await query('DELETE FROM payments')
})
test('Telegram login records Mini App use and returns the restore generation', async () => {
  const original = config.telegram.token
  config.telegram.token = '123456:synthetic-only-token'
  try {
    await query('UPDATE users SET telegram_chat_id=12345678,dataset_version=2 WHERE id=$1', [aliceId])
    const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 12345678, first_name: 'Demo' }) })
    const check = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
    const secret = createHmac('sha256', 'WebAppData').update(config.telegram.token).digest()
    params.set('hash', createHmac('sha256', secret).update(check).digest('hex'))
    const r = await client(app.base).post('/api/telegram/webapp', { initData: params.toString() })
    assert.equal(r.status, 200)
    assert.equal(r.body.user.dataset_version, 2)
    const tg = (await admin.get('/api/admin/telegram?filter=miniapp')).body
    assert.equal(tg.total, 1)
    assert.equal(tg.items[0].chat_id, '12345678')
    assert.ok(tg.items[0].last_miniapp_at)
    assert.ok(!JSON.stringify(tg).includes(r.body.token))
    assert.equal(tg.summary.miniapp7, 1)
  } finally {
    config.telegram.token = original
    await query('UPDATE users SET dataset_version=1 WHERE id=$1', [aliceId])
  }
})
test('notification exceptions are visible to admin with secret URLs removed', async () => {
  const delivered = await deliver(aliceId, 'commercial-delivery', 'telegram', new Date(), async () => {
    throw new Error('fetch https://api.telegram.org/bot123456:secret_token/sendMessage failed')
  })
  assert.equal(delivered, false)
  const r = (await admin.get(`/api/admin/deliveries?user_id=${aliceId}&status=pending`)).body
  assert.equal(r.total, 1)
  assert.match(r.items[0].last_error, /fetch \[URL\] failed/)
  assert.ok(!JSON.stringify(r).includes('secret_token'))
  await new Promise((r) => setTimeout(r, 30))
  const errors = (await admin.get(`/api/admin/errors?user_id=${aliceId}`)).body
  assert.ok(errors.items.some((e) => e.context?.operation === 'notification_delivery'))
  assert.ok(!JSON.stringify(errors).includes('secret_token'))
  await query('DELETE FROM notification_deliveries')
  await query('DELETE FROM error_log')
})
test('Push delivery filter includes individual device receipts', async () => {
  await query(
    `INSERT INTO notification_deliveries(user_id,key,channel,attempts) VALUES($1,'push-device-report','push-device:123',5),($1,'push-parent-report','push',1)`,
    [aliceId],
  )
  try {
    const r = (await admin.get(`/api/admin/deliveries?channel=push&user_id=${aliceId}`)).body
    assert.equal(r.total, 2)
    assert.equal((await admin.get('/api/admin/deliveries?channel=push&status=failed')).body.items[0].channel, 'push-device:123')
  } finally {
    await query("DELETE FROM notification_deliveries WHERE key LIKE 'push-%-report'")
  }
})

test('AI report shows unpriced runs and excludes prompts and generated content', async () => {
  await query(
    `INSERT INTO ai_runs(user_id,key,week_start,status,content,input_tokens,output_tokens,cost_usd,model,duration_ms) VALUES
    ($1,'priced','2026-10-05','done','{"summary":"PRIVATE CONTENT"}',100,20,0.0123,'synthetic-model',1000),
    ($1,'unpriced','2026-10-05','done','{"summary":"PRIVATE CONTENT"}',80,10,NULL,'synthetic-model',900),
    ($2,'failure','2026-10-05','failed',NULL,NULL,NULL,NULL,NULL,500)`,
    [aliceId, bobId],
  )
  const r = (await admin.get('/api/admin/ai-runs')).body
  assert.equal(r.summary.requests, 3)
  assert.equal(r.summary.failed, 1)
  assert.equal(r.summary.unpriced, 1)
  assert.equal(r.summary.known_cost_usd, 0.0123)
  assert.ok(!JSON.stringify(r).includes('PRIVATE CONTENT'))
  assert.equal((await admin.get('/api/admin/ai-runs?status=failed')).body.total, 1)
  assert.equal((await admin.get(`/api/admin/ai-runs?user_id=${aliceId}`)).body.total, 2)
})
