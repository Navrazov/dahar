import { operation } from '../history/operation.ts'
import { Router } from 'express'
import { badRequest, notFound } from '../../lib/errors.ts'
import { query } from '../../db/pool.ts'
import { userNow } from '../settings/settings.repository.ts'
import { exportBackup, restoreBackup, validateBackup, type Backup } from './backup.service.ts'

export function backupRoutes() {
  const r = Router()
  r.get('/backup', async (req, res) => {
    res.setHeader('Content-Disposition', `attachment; filename="dahar-backup-${(await userNow(req.user.id)).date}.json"`)
    res.json(await exportBackup(req.user.id))
  })
  r.post('/restore/preview', async (req, res) => res.json(validateBackup(req.body)))
  r.post('/restore', async (req, res) => {
    if (req.body?.confirm !== 'replace') throw badRequest('Подтвердите замену данных после проверки копии')
    await operation(
      req,
      res,
      'Восстановление',
      async (c) => {
        await restoreBackup(req.user.id, req.body as Backup, c)
        return { ok: true }
      },
      200,
      false,
    )
  })
  r.get('/backup/checkpoints', async (req, res) =>
    res.json((await query('SELECT id,created_at FROM saved_backups WHERE user_id=$1 ORDER BY id DESC LIMIT 10', [req.user.id])).rows),
  )
  r.post('/backup/checkpoints/:id/restore', async (req, res) => {
    if (req.body?.confirm !== 'replace') throw badRequest('Подтвердите восстановление')
    if (!Number.isSafeInteger(Number(req.params.id)) || Number(req.params.id) < 1) throw notFound()
    const row = (await query('SELECT data FROM saved_backups WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rows[0]
    if (!row) throw notFound()
    await operation(
      req,
      res,
      'Восстановление',
      async (c) => {
        await restoreBackup(req.user.id, row.data, c)
        return { ok: true }
      },
      200,
      false,
    )
  })
  return r
}
