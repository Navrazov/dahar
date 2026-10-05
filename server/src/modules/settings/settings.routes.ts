import { Router } from 'express'
import { badRequest } from '../../lib/errors.ts'
import { isValidTz } from '../../lib/time.ts'
import { getSettings, putSetting } from './settings.repository.ts'

export function settingsRoutes() {
  const r = Router()

  r.get('/', async (req, res) => res.json(await getSettings(req.user.id)))

  r.put('/:key', async (req, res) => {
    const { key } = req.params
    const value = req.body?.value ?? null
    if (!/^[a-z_]{1,40}$/.test(key)) throw badRequest('Неверный ключ настройки')
    if (key === 'timezone' && value !== null && !isValidTz(value)) throw badRequest('Неизвестный часовой пояс')
    if (JSON.stringify(value).length > 20_000) throw badRequest('Слишком большое значение настройки')
    await putSetting(req.user.id, key, value)
    res.json({ ok: true })
  })

  return r
}
