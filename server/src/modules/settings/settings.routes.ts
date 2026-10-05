import { trackActivation } from '../activation/activation.ts'
import { query } from '../../db/pool.ts'
import { operation } from '../history/operation.ts'
import { Router } from 'express'
import { badRequest } from '../../lib/errors.ts'
import { isValidTz } from '../../lib/time.ts'
import { getSetting, getSettings, putSetting } from './settings.repository.ts'

export function settingsRoutes() {
  const r = Router()

  r.get('/', async (req, res) => res.json(await getSettings(req.user.id)))

  r.put('/:key', async (req, res) => {
    const { key } = req.params
    const value = req.body?.value ?? null
    if (!/^[a-z_]{1,40}$/.test(key)) throw badRequest('Неверный ключ настройки')
    if (key === 'timezone' && value !== null && !isValidTz(value)) throw badRequest('Неизвестный часовой пояс')
    if (
      (key === 'currency' || key === 'trading_currency') &&
      value !== null &&
      (typeof value !== 'string' || !['₽', '$', '€', '₸', '₴', '¥', '£', 'Br', 'сум', 'USDT'].includes(value))
    )
      throw badRequest('Неизвестная валюта')
    if (key === 'trading_start_balance' && value !== null && (typeof value !== 'number' || !Number.isFinite(value)))
      throw badRequest('Начальный баланс должен быть числом')
    if (JSON.stringify(value).length > 20_000) throw badRequest('Слишком большое значение настройки')
    await operation(req, res, 'Настройки', async (c) => {
      if (key === 'currency' || key === 'trading_currency') {
        const old = (await getSetting(req.user.id, key, c)) || (key === 'currency' ? '₽' : '$')
        const tables = key === 'currency' ? ['transactions', 'sales', 'biz_expenses', 'accounts', 'products', 'budgets'] : ['trades']
        if ((value ?? (key === 'currency' ? '₽' : '$')) !== old) {
          for (const t of tables) {
            if ((await query(`SELECT 1 FROM "${t}" WHERE user_id=$1 LIMIT 1`, [req.user.id], c)).rowCount)
              throw badRequest('В аккаунте уже есть суммы. Валюту нельзя менять без конвертации')
          }
        }
      }
      await putSetting(req.user.id, key, value, c)
      if (key === 'onboarding_completed' && value === true) await trackActivation(req.user.id, 'onboarding_completed', c)
      return { ok: true }
    })
  })

  return r
}
