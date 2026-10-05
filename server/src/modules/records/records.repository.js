import { query, q } from '../../db/pool.js'
import { schema, isRef, dateColumn } from '../../db/schema.js'
import { badRequest } from '../../lib/errors.js'
import { isDate } from '../../lib/time.js'

export async function getRow(table, id, userId, client) {
  if (!Number.isInteger(Number(id))) return undefined
  const { rows } = await query(`SELECT * FROM ${q(table)} WHERE id = $1 AND user_id = $2`, [id, userId], client)
  return rows[0]
}

export async function listRows(table, userId, params = {}) {
  const where = ['user_id = $1']
  const args = [userId]
  const add = (sql, v) => {
    args.push(v)
    where.push(sql.replace('?', `$${args.length}`))
  }
  for (const [k, v] of Object.entries(params)) if (k in schema[table] && typeof v === 'string') add(`${q(k)} = ?`, v)
  const dc = dateColumn[table]
  if (dc && isDate(params.from)) add(`substr(${q(dc)}, 1, 10) >= ?`, params.from)
  if (dc && isDate(params.to)) add(`substr(${q(dc)}, 1, 10) <= ?`, params.to)
  const limit = Math.min(Math.max(Number(params.limit) || 0, 0), 5000)
  const offset = Math.max(Number(params.offset) || 0, 0)
  const { rows } = await query(
    `SELECT * FROM ${q(table)} WHERE ${where.join(' AND ')} ORDER BY id DESC${limit ? ` LIMIT ${limit} OFFSET ${offset}` : ''}`,
    args,
  )
  return rows
}

export async function insertRow(table, data, userId, client) {
  const cols = Object.keys(data)
  const { rows } = await query(
    `INSERT INTO ${q(table)} (user_id${cols.map((c) => `, ${q(c)}`).join('')})
     VALUES ($1${cols.map((_, i) => `, $${i + 2}`).join('')}) RETURNING *`,
    [userId, ...Object.values(data)],
    client,
  )
  return rows[0]
}

export async function patchRow(table, id, data, userId, client) {
  const cols = Object.keys(data)
  const { rows } = await query(
    `UPDATE ${q(table)} SET ${cols.map((col, i) => `${q(col)} = $${i + 1}`).join(', ')}
     WHERE id = $${cols.length + 1} AND user_id = $${cols.length + 2} RETURNING *`,
    [...Object.values(data), id, userId],
    client,
  )
  return rows[0]
}

export async function removeRow(table, id, userId, client) {
  await query(`DELETE FROM ${q(table)} WHERE id = $1 AND user_id = $2`, [id, userId], client)
}

export async function assertRefsOwned(table, data, userId, client) {
  for (const [col, type] of Object.entries(schema[table])) {
    if (!isRef(type) || data[col] == null) continue
    const { rowCount } = await query(`SELECT 1 FROM ${q(type.ref)} WHERE id = $1 AND user_id = $2`, [data[col], userId], client)
    if (!rowCount) throw badRequest(`Связанная запись не найдена (${col})`)
  }
}
