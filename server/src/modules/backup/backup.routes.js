import { Router } from 'express'
import { badRequest } from '../../lib/errors.js'
import { userNow } from '../settings/settings.repository.js'
import { exportBackup, restoreBackup } from './backup.service.js'

export function backupRoutes() {
  const r = Router()

  r.get('/backup', async (req, res) => {
    const backup = await exportBackup(req.user.id)
    res.setHeader('Content-Disposition', `attachment; filename="dahar-backup-${(await userNow(req.user.id)).date}.json"`)
    res.json(backup)
  })

  r.post('/restore', async (req, res) => {
    if (!req.body?.data || typeof req.body.data !== 'object') throw badRequest('Неверный файл резервной копии')
    await restoreBackup(req.user.id, req.body)
    res.json({ ok: true })
  })

  return r
}
