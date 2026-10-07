import { recordLabels } from './records.labels.ts'
import { startAction } from '../history/operation.ts'
import { trackActivation, trackBehavior } from '../activation/activation.ts'
import type { PoolClient } from 'pg'
import { decode, encode } from '../../db/codec.ts'
import { tx } from '../../db/pool.ts'
import type { TableName } from '../../db/schema.ts'
import { notFound } from '../../lib/errors.ts'
import { hooks } from './records.hooks.ts'
import { assertRefsOwned, getRow, insertRow, listRows, patchRow, removeRow, type ListParams } from './records.repository.ts'

export async function listRecords(table: TableName, userId: number, params?: ListParams) {
  return (await listRows(table, userId, params)).map(decode)
}

export async function getRecord(table: TableName, id: unknown, userId: number, client?: PoolClient) {
  const row = await getRow(table, id, userId, client)
  if (!row) throw notFound()
  return decode(row)
}

export function createRecord(table: TableName, body: unknown, userId: number, client?: PoolClient) {
  const run = async (c: PoolClient) => {
    await c.query('SELECT pg_advisory_xact_lock($1,$2)', [7262005, userId])
    const data = encode(table, body)
    await assertRefsOwned(table, data, userId, c)
    await hooks[table]?.beforeWrite?.(data, null, c, userId)
    await assertRefsOwned(table, data, userId, c)
    const created = await insertRow(table, data, userId, c)
    await hooks[table]?.afterCreate?.(created, c, userId)
    if (table === 'tasks') {
      await trackActivation(userId, 'first_task', c)
      await trackBehavior(userId, 'task_created', c)
    }
    if (table === 'habits') await trackActivation(userId, 'first_habit', c)
    if (table === 'reviews') {
      await trackActivation(userId, 'first_review', c)
      await trackBehavior(userId, 'review_saved', c)
    }
    if (table === 'tasks' && created.status === 'done') {
      await trackActivation(userId, 'first_completion', c)
      await trackBehavior(userId, 'task_completed', c)
    }
    return decode(created)
  }
  return client
    ? run(client)
    : tx(async (c) => {
        await startAction(userId, 'Создание: ' + recordLabels[table], c)
        return run(c)
      })
}

export function updateRecord(table: TableName, id: unknown, body: unknown, userId: number, client?: PoolClient) {
  const run = async (c: PoolClient) => {
    await c.query('SELECT pg_advisory_xact_lock($1,$2)', [7262005, userId])
    const prev = await getRow(table, id, userId, c, true)
    if (!prev) throw notFound()
    const data = encode(table, body, { partial: true })
    await assertRefsOwned(table, data, userId, c)
    await hooks[table]?.beforeWrite?.(data, prev, c, userId)
    await assertRefsOwned(table, data, userId, c)
    const updated = Object.keys(data).length ? await patchRow(table, prev.id, data, userId, c) : prev
    await hooks[table]?.afterUpdate?.(updated, prev, c, userId)
    if (table === 'reviews') await trackBehavior(userId, 'review_saved', c)
    if (table === 'tasks' && updated.status === 'done' && prev.status !== 'done') {
      await trackActivation(userId, 'first_completion', c)
      await trackBehavior(userId, 'task_completed', c)
    }
    return decode(updated)
  }
  return client
    ? run(client)
    : tx(async (c) => {
        await startAction(userId, 'Изменение: ' + recordLabels[table], c)
        return run(c)
      })
}

export function deleteRecord(table: TableName, id: unknown, userId: number, client?: PoolClient) {
  const run = async (c: PoolClient) => {
    await c.query('SELECT pg_advisory_xact_lock($1,$2)', [7262005, userId])
    const prev = await getRow(table, id, userId, c, true)
    if (!prev) throw notFound()
    await removeRow(table, prev.id, userId, c)
    await hooks[table]?.afterDelete?.(prev, c, userId)
  }
  return client
    ? run(client)
    : tx(async (c) => {
        await startAction(userId, 'Удаление: ' + recordLabels[table], c)
        return run(c)
      })
}
