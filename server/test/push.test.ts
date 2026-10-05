import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createUser, login, pool, query, resetDatabase, startApp, type App, type Client } from './helpers.ts'
import { initPush, pushPublicKey, type PushMessage } from '../src/modules/push/push.service.ts'
import { sendReminders } from '../src/jobs/reminders.ts'
import { sendDigests } from '../src/jobs/digest.ts'
import { nowIn } from '../src/lib/time.ts'

let app: App, user: Client, other: Client, userId: number

const subscription = (n: number) => ({
  endpoint: `https://push.example.com/send/${n}`,
  keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' },
})

const silentTelegram = { send: async () => {}, edit: async () => {}, answer: async () => {} }

function fakePush() {
  const sent: { userId: number; message: PushMessage }[] = []
  return {
    sent,
    sendToUser: async (id: number, message: PushMessage) => {
      sent.push({ userId: id, message })
      return 1
    },
  }
}

before(async () => {
  await resetDatabase()
  await initPush()
  app = await startApp()
  userId = await createUser('pusher')
  await createUser('other')
  user = await login(app.base, 'pusher')
  other = await login(app.base, 'other')
  await user.put('/api/settings/timezone', { value: 'Europe/Moscow' })
})

after(async () => {
  await app.close()
  await pool.end()
})

test('VAPID keys are created once and survive restarts', async () => {
  const key = pushPublicKey()
  assert.match(key ?? '', /^[A-Za-z0-9_-]{80,}$/)
  await initPush()
  assert.equal(pushPublicKey(), key)
  assert.equal((await user.get('/api/push')).body.publicKey, key)
})

test('subscriptions are validated and belong to one user', async () => {
  assert.equal((await user.post('/api/push/subscribe', { endpoint: 'http://insecure', keys: {} })).status, 400)
  assert.equal((await user.post('/api/push/subscribe', subscription(1))).status, 201)
  assert.equal((await user.get('/api/push')).body.devices, 1)
  assert.equal((await other.get('/api/push')).body.devices, 0)

  await other.post('/api/push/unsubscribe', { endpoint: subscription(1).endpoint })
  assert.equal((await user.get('/api/push')).body.devices, 1, 'someone else cannot remove my device')

  // Тот же браузер, другой вошедший пользователь — подписка переходит к нему, а не дублируется.
  await other.post('/api/push/subscribe', subscription(1))
  assert.equal((await user.get('/api/push')).body.devices, 0)
  assert.equal((await other.get('/api/push')).body.devices, 1)
  await other.post('/api/push/unsubscribe', { endpoint: subscription(1).endpoint })
})

test('reminders reach users who only have push, with a Done action', async () => {
  await user.post('/api/push/subscribe', subscription(2))
  const now = nowIn('Europe/Moscow')
  const task = (await user.post('/api/tasks', { title: 'Позвонить маме', due_date: now.date, due_time: '00:00' })).body
  const push = fakePush()
  assert.equal(await sendReminders(silentTelegram, new Date(), push), 1)
  assert.deepEqual(push.sent, [
    { userId, message: { title: 'Позвонить маме', body: 'Напоминание · 00:00', url: '/tasks', tag: `task-${task.id}`, taskId: task.id } },
  ])
  assert.equal(await sendReminders(silentTelegram, new Date(), push), 0, 'once per task')
})

test('the morning digest goes to push too', async () => {
  await user.put('/api/settings/digest_hour', { value: 0 })
  await query(`DELETE FROM settings WHERE key = 'last_digest'`)
  const push = fakePush()
  const at = new Date()
  const expected = nowIn('Europe/Moscow', at).hour < 3 ? 1 : 0
  assert.equal(await sendDigests(silentTelegram, at, push), expected)
  if (expected) assert.match(push.sent[0].message.body, /задач/i)
})
