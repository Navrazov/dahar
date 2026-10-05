import { schema, isRef } from './schema.js'

const numeric = new Set(['real', 'money', 'decimal'])

export function encode(table, body) {
  const out = {}
  for (const [col, type] of Object.entries(schema[table])) {
    if (!(col in body)) continue
    let v = body[col]
    if (v === '' || v === undefined) v = null
    if (v != null) {
      if (type === 'json') v = JSON.stringify(v)
      else if (type === 'bool') v = !!v
      else if (type === 'int' || isRef(type)) v = Number.isFinite(Number(v)) ? Math.round(Number(v)) : null
      else if (numeric.has(type)) v = Number.isFinite(Number(v)) ? Number(v) : null
      else v = String(v)
    }
    out[col] = v
  }
  return out
}

export function decode(row) {
  if (!row) return row
  const { user_id, ...rest } = row
  return rest
}
