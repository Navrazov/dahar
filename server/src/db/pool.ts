import pg, { type PoolClient, type QueryResult, type QueryResultRow } from 'pg'
import { config } from '../config.ts'

const { types } = pg
types.setTypeParser(types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)))
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : Number(v)))
// Даты и время пользователя — «настенные», без часового пояса. API отдаёт их строками в прежнем формате.
types.setTypeParser(types.builtins.DATE, (v) => v)
types.setTypeParser(types.builtins.TIME, (v) => (v === null ? null : v.slice(0, 5)))
types.setTypeParser(types.builtins.TIMESTAMP, (v) => (v === null ? null : `${v.slice(0, 10)}T${v.slice(11, 16)}`))

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
})

export type Db = pg.Pool | PoolClient

/** Строка из базы: колонки зависят от запроса, поэтому типизируем на месте использования. */

export type DbRow = Record<string, any>

export const dbLabel = config.databaseUrl.replace(/\/\/[^@]*@/, '//***@')

export const query = <R extends QueryResultRow = DbRow>(sql: string, params: unknown[] = [], client: Db = pool): Promise<QueryResult<R>> =>
  client.query<R>(sql, params)

export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export const q = (name: string) => `"${name}"`
