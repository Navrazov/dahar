import { Router } from 'express'
import { badRequest } from '../../lib/errors.ts'
import { createLinkCode, isLinked, unlinkChat } from './linking.ts'
import { botInfo } from './transport.ts'

export function telegramRoutes() {
  const r = Router()

  r.get('/', async (req, res) => res.json({ ...botInfo(), linked: await isLinked(req.user.id) }))

  r.post('/code', async (req, res) => {
    if (!botInfo().enabled) throw badRequest('Бот не настроен на сервере (TELEGRAM_BOT_TOKEN)')
    res.json(await createLinkCode(req.user.id))
  })

  r.delete('/link', async (req, res) => {
    await unlinkChat(req.user.id)
    res.json({ ok: true })
  })

  return r
}
