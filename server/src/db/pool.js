import pg from 'pg'
import { config } from '../config.js'

pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)))
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)))

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
})

export const dbLabel = config.databaseUrl.replace(/\/\/[^@]*@/, '//***@')

export const query = (sql, params = [], client = pool) => client.query(sql, params)

export async function tx(fn) {
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

export const q = (name) => `"${name}"`
