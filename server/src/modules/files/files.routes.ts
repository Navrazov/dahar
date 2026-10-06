import { Router } from 'express'
import { badRequest, notFound } from '../../lib/errors.ts'
import { query } from '../../db/pool.ts'
import { consumeLimit } from '../../lib/rate-limit.ts'
import { readFile, storeFile } from './files.storage.ts'

export function filesRoutes() {
  const r = Router()

  r.post('/', async (req, res) => {
    if (await consumeLimit('file-upload', String(req.user.id), 60, 60 * 60 * 1000)) return res.status(429).json({ error: 'Лимит загрузок на час исчерпан' })
    const usage = (await query('SELECT count(*)::int AS n,COALESCE(sum(size),0) AS bytes FROM files WHERE user_id=$1', [req.user.id])).rows[0]
    if (usage.n >= 500 || Number(usage.bytes) >= 256 * 1024 * 1024) throw badRequest('Лимит изображений аккаунта: 500 файлов или 256 МБ')
    res.status(201).json({ url: await storeFile(req.user.id, req.body?.data) })
  })

  r.get('/:id', async (req, res) => {
    const f = await readFile(req.user.id, req.params.id)
    if (!f) throw notFound('Файл не найден')
    res.setHeader('Content-Type', f.mime)
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
    res.send(f.body)
  })

  return r
}
