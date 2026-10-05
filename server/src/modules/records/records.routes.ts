import { recordLabels } from './records.labels.ts'
import { operation } from '../history/operation.ts'
import { Router } from 'express'
import { isTable, type TableName } from '../../db/schema.ts'
import { badRequest, notFound } from '../../lib/errors.ts'
import { createRecord, deleteRecord, getRecord, listRecords, updateRecord } from './records.service.ts'

export function recordsRoutes() {
  const r = Router()
  r.post('/tasks/bulk', async (req, res) => {
    const ids = req.body?.ids
    if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some((id) => !Number.isInteger(id) || id === 0)) throw badRequest('Неверный список задач')
    const data = Object.fromEntries(Object.entries(req.body?.data ?? {}).filter(([key]) => ['status', 'due_date', 'project_id', 'focus_date'].includes(key)))
    if (!Object.keys(data).length) throw badRequest('Нет изменений')
    await operation(req, res, 'Изменение выбранных задач', async (c) => {
      for (const id of [...new Set<number>(ids)].sort((a, b) => a - b)) await updateRecord('tasks', id, data, req.user.id, c)
      return { ok: true }
    })
  })

  r.param('table', (_req, _res, next, table) => next(isTable(table) ? undefined : notFound(`Неизвестная коллекция ${table}`)))

  const table = (p: Record<string, string>) => p.table as TableName

  r.get('/:table', async (req, res) => res.json(await listRecords(table(req.params), req.user.id, req.query)))
  r.get('/:table/:id', async (req, res) => res.json(await getRecord(table(req.params), req.params.id, req.user.id)))
  r.post('/:table', async (req, res) =>
    operation(req, res, 'Создание: ' + recordLabels[table(req.params)], (c) => createRecord(table(req.params), req.body, req.user.id, c), 201),
  )
  r.patch('/:table/:id', async (req, res) =>
    operation(req, res, 'Изменение: ' + recordLabels[table(req.params)], (c) => updateRecord(table(req.params), req.params.id, req.body, req.user.id, c)),
  )
  r.delete('/:table/:id', async (req, res) => {
    await operation(req, res, 'Удаление: ' + recordLabels[table(req.params)], async (c) => {
      await deleteRecord(table(req.params), req.params.id, req.user.id, c)
      return { ok: true }
    })
  })

  return r
}
