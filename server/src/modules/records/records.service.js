import { decode, encode } from '../../db/codec.js'
import { tx } from '../../db/pool.js'
import { internalColumns } from '../../db/schema.js'
import { notFound } from '../../lib/errors.js'
import { hooks } from './records.hooks.js'
import { assertRefsOwned, getRow, insertRow, listRows, patchRow, removeRow } from './records.repository.js'

function clientData(table, body) {
  const data = encode(table, body || {})
  for (const col of internalColumns) delete data[col]
  return data
}

export async function listRecords(table, userId, params) {
  return (await listRows(table, userId, params)).map(decode)
}

export async function getRecord(table, id, userId) {
  const row = await getRow(table, id, userId)
  if (!row) throw notFound()
  return decode(row)
}

export function createRecord(table, body, userId) {
  return tx(async (c) => {
    const data = clientData(table, body)
    await hooks[table]?.beforeWrite?.(data, null, c, userId)
    await assertRefsOwned(table, data, userId, c)
    const created = await insertRow(table, data, userId, c)
    await hooks[table]?.afterCreate?.(created, c, userId)
    return decode(created)
  })
}

export function updateRecord(table, id, body, userId) {
  return tx(async (c) => {
    const prev = await getRow(table, id, userId, c)
    if (!prev) throw notFound()
    const data = clientData(table, body)
    await hooks[table]?.beforeWrite?.(data, prev, c, userId)
    await assertRefsOwned(table, data, userId, c)
    const updated = Object.keys(data).length ? await patchRow(table, prev.id, data, userId, c) : prev
    await hooks[table]?.afterUpdate?.(updated, prev, c, userId)
    return decode(updated)
  })
}

export function deleteRecord(table, id, userId) {
  return tx(async (c) => {
    const prev = await getRow(table, id, userId, c)
    if (!prev) throw notFound()
    await removeRow(table, prev.id, userId, c)
    await hooks[table]?.afterDelete?.(prev, c, userId)
  })
}
