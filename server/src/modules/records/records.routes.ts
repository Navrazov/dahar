import { query } from '../../db/pool.ts'
import { recordLabels } from './records.labels.ts'
import { operation } from '../history/operation.ts'
import { Router } from 'express'
import { isTable, type TableName } from '../../db/schema.ts'
import { badRequest, notFound } from '../../lib/errors.ts'
import { createRecord, deleteRecord, getRecord, listRecords, updateRecord } from './records.service.ts'

export function recordsRoutes() {
  const r = Router()
  r.post('/tasks/reorder', async (req, res) => {
    const { id, before_id } = req.body ?? {}
    if (![id, before_id].every((v) => Number.isInteger(v) && v > 0 && v <= 2_147_483_647) || id === before_id) throw badRequest('Неверные задачи для переноса')
    await operation(req, res, 'Перенос задачи', async (c) => {
      const target = await getRecord('tasks', before_id, req.user.id, c)
      const source = await getRecord('tasks', id, req.user.id, c)
      const day = target.planned_date || target.due_date || null
      const done = target.status === 'done'
      await updateRecord(
        'tasks',
        id,
        {
          ...((source.planned_date || source.due_date || null) === day ? {} : { due_date: day }),
          planned_date: day,
          focus_date: source.focus_date === day ? source.focus_date : null,
          ...(done ? { status: 'done' } : source.status === 'done' ? { status: 'todo' } : {}),
        },
        req.user.id,
        c,
      )
      const rows = (
        await query(
          `SELECT id FROM tasks WHERE user_id=$1 AND (status IS NOT DISTINCT FROM 'done')=$2 AND COALESCE(planned_date,due_date) IS NOT DISTINCT FROM $3::date
        ORDER BY sort_order ASC NULLS LAST,CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'low' THEN 3 ELSE 2 END,id DESC`,
          [req.user.id, done, day],
          c,
        )
      ).rows
      const ids = rows.map((r) => r.id).filter((v) => v !== id),
        position = ids.indexOf(before_id)
      if (position < 0) throw badRequest('Задача уже перенесена. Обновите список')
      ids.splice(position, 0, id)
      await query(
        `UPDATE tasks t SET sort_order=(ordered.position-1)::int FROM unnest($1::int[]) WITH ORDINALITY ordered(id,position)
        WHERE t.id=ordered.id AND t.user_id=$2 AND t.sort_order IS DISTINCT FROM (ordered.position-1)::int`,
        [ids, req.user.id],
        c,
      )
      return { ok: true }
    })
  })
  r.post('/tasks/bulk', async (req, res) => {
    const ids = req.body?.ids
    if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some((id) => !Number.isInteger(id) || id === 0)) throw badRequest('Неверный список задач')
    const data = Object.fromEntries(
      Object.entries(req.body?.data ?? {}).filter(([key]) => ['status', 'due_date', 'project_id', 'focus_date', 'planned_date'].includes(key)),
    )
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
      const action = (await query("SELECT current_setting('dahar.action')::bigint AS id", [], c)).rows[0].id
      return { ok: true, action_id: action }
    })
  })

  return r
}
