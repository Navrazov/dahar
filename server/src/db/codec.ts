import { normalizeRecord, ValidationError, type NormalizeOptions } from '@dahar/shared'
import { badRequest } from '../lib/errors.ts'
import type { DbRow } from './pool.ts'
import { fieldsOf, type TableName } from './schema.ts'

/** Проверенные данные для INSERT / UPDATE: значения уже в виде, который понимает Postgres. */
export type Encoded = Record<string, unknown>

export function encode(table: TableName, body: unknown, opts: NormalizeOptions = {}): Encoded {
  const src = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
  let out: Encoded
  try {
    out = normalizeRecord(table, src, opts)
  } catch (e) {
    if (e instanceof ValidationError) throw badRequest(e.message)
    throw e
  }
  for (const [col, def] of fieldsOf(table)) if (def.type === 'weekdays' && out[col] != null) out[col] = JSON.stringify(out[col])
  return out
}

export function decode<T extends DbRow | undefined>(row: T): T {
  if (!row) return row
  const { user_id: _, ...rest } = row
  return rest as T
}
