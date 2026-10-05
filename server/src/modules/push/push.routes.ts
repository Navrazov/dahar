import { Router } from 'express'
import { badRequest } from '../../lib/errors.ts'
import { isValidSubscription, pushPublicKey, pushSender, removeSubscription, saveSubscription, subscriptionCount } from './push.service.ts'

export function pushRoutes() {
  const r = Router()

  r.get('/', async (req, res) => res.json({ publicKey: pushPublicKey(), devices: await subscriptionCount(req.user.id) }))

  r.post('/subscribe', async (req, res) => {
    if (!isValidSubscription(req.body)) throw badRequest('Неверная подписка на уведомления')
    await saveSubscription(req.user.id, req.body, String(req.headers['user-agent'] ?? '') || null)
    res.status(201).json({ ok: true })
  })

  r.post('/unsubscribe', async (req, res) => {
    if (typeof req.body?.endpoint !== 'string') throw badRequest('Нужен endpoint')
    await removeSubscription(req.user.id, req.body.endpoint)
    res.json({ ok: true })
  })

  r.post('/test', async (req, res) => {
    const delivered = await pushSender.sendToUser(req.user.id, { title: 'Dahar', body: 'Уведомления работают', url: '/settings', tag: 'test' })
    res.json({ delivered })
  })

  return r
}
