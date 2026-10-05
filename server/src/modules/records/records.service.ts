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

export async function getRecord(table: TableName, id: unknown, userId: number) {
  const row = await getRow(table, id, userId)
  if (!row) throw notFound()
  return decode(row)
}

export function createRecord(table: TableName, body: unknown, userId: number, client?: PoolClient) {
  const run = async (c: PoolClient) => {
    const data = encode(table, body)
    await hooks[table]?.beforeWrite?.(data, null, c, userId)
    await assertRefsOwned(table, data, userId, c)
    const created = await insertRow(table, data, userId, c)
    await hooks[table]?.afterCreate?.(created, c, userId)
    return decode(created)
  }
  return client ? run(client) : tx(run)
}

export function updateRecord(table: TableName, id: unknown, body: unknown, userId: number) {
  return tx(async (c) => {
    const prev = await getRow(table, id, userId, c)
    if (!prev) throw notFound()
    const data = encode(table, body, { partial: true })
    await hooks[table]?.beforeWrite?.(data, prev, c, userId)
    await assertRefsOwned(table, data, userId, c)
    const updated = Object.keys(data).length ? await patchRow(table, prev.id, data, userId, c) : prev
    await hooks[table]?.afterUpdate?.(updated, prev, c, userId)
    return decode(updated)
  })
}

export function deleteRecord(table: TableName, id: unknown, userId: number) {
  return tx(async (c) => {
    const prev = await getRow(table, id, userId, c)
    if (!prev) throw notFound()
    await removeRow(table, prev.id, userId, c)
    await hooks[table]?.afterDelete?.(prev, c, userId)
  })
}
