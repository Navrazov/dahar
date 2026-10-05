import type { FieldDef } from '@dahar/shared'

export { dateColumn, fieldsOf, internalColumns, isTable, schema, tableOrder, type FieldDef, type TableName } from '@dahar/shared'

export const sqlType: Record<Exclude<FieldDef['type'], 'ref'>, string> = {
  text: 'text',
  enum: 'text',
  int: 'integer',
  real: 'double precision',
  money: 'numeric(18,2)',
  decimal: 'numeric(24,8)',
  bool: 'boolean',
  weekdays: 'jsonb',
  date: 'date',
  time: 'time',
  datetime: 'timestamp',
}

export const isRef = (def: FieldDef): def is Extract<FieldDef, { type: 'ref' }> => def.type === 'ref'
