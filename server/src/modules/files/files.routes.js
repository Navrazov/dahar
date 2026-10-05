import { Router } from 'express'
import { notFound } from '../../lib/errors.js'
import { readFile, storeFile } from './files.storage.js'

export function filesRoutes() {
  const r = Router()

  r.post('/', async (req, res) => res.status(201).json({ url: await storeFile(req.user.id, req.body?.data) }))

  r.get('/:id', async (req, res) => {
    const f = await readFile(req.user.id, req.params.id)
    if (!f) throw notFound('Файл не найден')
    res.setHeader('Content-Type', f.mime)
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
    res.send(f.body)
  })

  return r
}
