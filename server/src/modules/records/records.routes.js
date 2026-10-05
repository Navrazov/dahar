import { Router } from 'express'
import { schema } from '../../db/schema.js'
import { notFound } from '../../lib/errors.js'
import { createRecord, deleteRecord, getRecord, listRecords, updateRecord } from './records.service.js'

export function recordsRoutes() {
  const r = Router()

  r.param('table', (req, _res, next, table) => next(schema[table] ? undefined : notFound(`Неизвестная коллекция ${table}`)))

  r.get('/:table', async (req, res) => res.json(await listRecords(req.params.table, req.user.id, req.query)))
  r.get('/:table/:id', async (req, res) => res.json(await getRecord(req.params.table, req.params.id, req.user.id)))
  r.post('/:table', async (req, res) => res.status(201).json(await createRecord(req.params.table, req.body, req.user.id)))
  r.patch('/:table/:id', async (req, res) => res.json(await updateRecord(req.params.table, req.params.id, req.body, req.user.id)))
  r.delete('/:table/:id', async (req, res) => {
    await deleteRecord(req.params.table, req.params.id, req.user.id)
    res.json({ ok: true })
  })

  return r
}
