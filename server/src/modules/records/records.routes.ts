import { Router } from 'express'
import { isTable, type TableName } from '../../db/schema.ts'
import { notFound } from '../../lib/errors.ts'
import { createRecord, deleteRecord, getRecord, listRecords, updateRecord } from './records.service.ts'

export function recordsRoutes() {
  const r = Router()

  r.param('table', (_req, _res, next, table) => next(isTable(table) ? undefined : notFound(`Неизвестная коллекция ${table}`)))

  const table = (p: Record<string, string>) => p.table as TableName

  r.get('/:table', async (req, res) => res.json(await listRecords(table(req.params), req.user.id, req.query)))
  r.get('/:table/:id', async (req, res) => res.json(await getRecord(table(req.params), req.params.id, req.user.id)))
  r.post('/:table', async (req, res) => res.status(201).json(await createRecord(table(req.params), req.body, req.user.id)))
  r.patch('/:table/:id', async (req, res) => res.json(await updateRecord(table(req.params), req.params.id, req.body, req.user.id)))
  r.delete('/:table/:id', async (req, res) => {
    await deleteRecord(table(req.params), req.params.id, req.user.id)
    res.json({ ok: true })
  })

  return r
}
