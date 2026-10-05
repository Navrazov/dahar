import { Router } from 'express'
import { userNow } from '../settings/settings.repository.js'
import { financeSummary } from './finance.service.js'
import { commitImport, previewImport } from './import/import.service.js'

export function financeRoutes() {
  const r = Router()

  r.get('/summary', async (req, res) => {
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month)) ? String(req.query.month) : (await userNow(req.user.id)).date.slice(0, 7)
    res.json(await financeSummary(req.user.id, month))
  })

  r.post('/import/preview', async (req, res) => res.json(await previewImport(req.user.id, req.body)))
  r.post('/import', async (req, res) => res.json(await commitImport(req.user.id, req.body)))

  return r
}
