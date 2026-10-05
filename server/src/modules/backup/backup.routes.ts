import { Router } from 'express'
import { badRequest } from '../../lib/errors.ts'
import { userNow } from '../settings/settings.repository.ts'
import { exportBackup, restoreBackup, type Backup } from './backup.service.ts'

export function backupRoutes() {
  const r = Router()

  r.get('/backup', async (req, res) => {
    const backup = await exportBackup(req.user.id)
    res.setHeader('Content-Disposition', `attachment; filename="dahar-backup-${(await userNow(req.user.id)).date}.json"`)
    res.json(backup)
  })

  r.post('/restore', async (req, res) => {
    if (!req.body?.data || typeof req.body.data !== 'object') throw badRequest('Неверный файл резервной копии')
    await restoreBackup(req.user.id, req.body as Backup)
    res.json({ ok: true })
  })

  return r
}
