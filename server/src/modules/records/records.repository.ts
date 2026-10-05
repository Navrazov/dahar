import { encode, type Encoded } from '../../db/codec.ts'
import { query, q, type Db, type DbRow } from '../../db/pool.ts'
import { dateColumn, fieldsOf, isRef, schema, type TableName } from '../../db/schema.ts'
import { badRequest } from '../../lib/errors.ts'
import { isDate } from '../../lib/time.ts'

const isId = (id: unknown) => Number.isInteger(Number(id)) && Number(id) > 0 && Number(id) <= 2_147_483_647

export async function getRow(table: TableName, id: unknown, userId: number, client?: Db, lock = false): Promise<DbRow | undefined> {
  if (!isId(id)) return undefined
  const { rows } = await query(`SELECT * FROM ${q(table)} WHERE id = $1 AND user_id = $2${lock ? ' FOR UPDATE' : ''}`, [Number(id), userId], client)
  return rows[0]
}

export type ListParams = Record<string, unknown>

export async function listRows(table: TableName, userId: number, params: ListParams = {}) {
  const where = ['user_id = $1']
  const args: unknown[] = [userId]
  const add = (sql: string, v: unknown) => {
    args.push(v)
    where.push(sql.replaceAll('?', `$${args.length}`))
  }
  const filters = Object.fromEntries(Object.entries(params).filter(([k, v]) => Object.hasOwn(schema[table], k) && typeof v === 'string'))
  for (const [k, v] of Object.entries(encode(table, filters, { partial: true, internal: false }))) {
    if (v === null) where.push(`${q(k)} IS NULL`)
    else add(`${q(k)} = ?`, v)
  }
  if (params.before !== undefined) {
    if (!isId(params.before)) throw badRequest('Неверный курсор списка')
    add('id < ?', Number(params.before))
  }
  const dc = dateColumn[table]
  if (dc && params.from !== undefined) {
    if (!isDate(params.from)) throw badRequest('from: ожидается дата ГГГГ-ММ-ДД')
    add(`${q(dc)} >= ?::date`, params.from)
  }
  if (dc && params.to !== undefined) {
    if (!isDate(params.to)) throw badRequest('to: ожидается дата ГГГГ-ММ-ДД')
    add(`${q(dc)} < ?::date + 1`, params.to)
  }
  for (const key of ['limit', 'offset'])
    if (params[key] !== undefined && !/^\d{1,9}$/.test(String(params[key]))) throw badRequest(`${key}: ожидается неотрицательное целое число`)
  const limit = Math.min(Math.max(Math.floor(Number(params.limit) || 500), 1), 5000)
  const offset = Math.max(Math.floor(Number(params.offset) || 0), 0)
  const { rows } = await query(
    `SELECT * FROM ${q(table)} WHERE ${where.join(' AND ')} ORDER BY id DESC${limit ? ` LIMIT ${limit} OFFSET ${offset}` : ''}`,
    args,
  )
  return rows
}

export async function insertRow(table: TableName, data: Encoded, userId: number, client?: Db): Promise<DbRow> {
  const cols = Object.keys(data)
  const { rows } = await query(
    `INSERT INTO ${q(table)} (user_id${cols.map((c) => `, ${q(c)}`).join('')})
     VALUES ($1${cols.map((_, i) => `, $${i + 2}`).join('')}) RETURNING *`,
    [userId, ...Object.values(data)],
    client,
  )
  return rows[0]
}

export async function patchRow(table: TableName, id: number, data: Encoded, userId: number, client?: Db): Promise<DbRow> {
  const cols = Object.keys(data)
  const { rows } = await query(
    `UPDATE ${q(table)} SET ${cols.map((col, i) => `${q(col)} = $${i + 1}`).join(', ')}
     WHERE id = $${cols.length + 1} AND user_id = $${cols.length + 2} RETURNING *`,
    [...Object.values(data), id, userId],
    client,
  )
  return rows[0]
}

export async function removeRow(table: TableName, id: number, userId: number, client?: Db) {
  await query(`DELETE FROM ${q(table)} WHERE id = $1 AND user_id = $2`, [id, userId], client)
}

export async function assertRefsOwned(table: TableName, data: Encoded, userId: number, client?: Db) {
  for (const [col, def] of fieldsOf(table)) {
    if (!isRef(def) || data[col] == null) continue
    const { rowCount } = await query(`SELECT 1 FROM ${q(def.ref)} WHERE id = $1 AND user_id = $2`, [data[col], userId], client)
    if (!rowCount) throw badRequest(`Связанная запись не найдена (${col})`)
  }
}
