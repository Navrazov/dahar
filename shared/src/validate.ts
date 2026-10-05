import { fieldsOf, internalColumns, type FieldDef, type TableName } from './schema.ts'

export class ValidationError extends Error {
  field: string
  constructor(field: string, message: string) {
    super(message)
    this.field = field
  }
}

export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && sameDate(s)

const sameDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/
const DATETIME = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?$/
const COLOR = /^#[0-9a-f]{3,8}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normTime(v: unknown): string | null {
  const m = TIME.exec(String(v).trim())
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null
}

export function normDateTime(v: unknown): string | null {
  const m = DATETIME.exec(String(v).trim())
  if (!m || !isDate(m[1])) return null
  const time = m[2] ? normTime(m[2]) : '00:00'
  return time ? `${m[1]}T${time}` : null
}

const LIMITS: Record<string, number> = { int: 2_147_483_647, ref: 2_147_483_647, money: 1e15, decimal: 1e15, real: 1e15 }

/** Приводит значение к типу колонки. `undefined` — значение не подходит. */
function coerce(def: FieldDef, v: unknown): unknown {
  switch (def.type) {
    case 'text': {
      const s = typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : undefined
      if (s === undefined || s.length > def.max) return undefined
      if (def.format === 'color' && !COLOR.test(s)) return undefined
      if (def.format === 'email' && !EMAIL.test(s.trim())) return undefined
      if (def.required && !s.trim()) return undefined
      return s
    }
    case 'enum':
      return typeof v === 'string' && def.values.includes(v) ? v : undefined
    case 'int':
    case 'ref':
    case 'real':
    case 'money':
    case 'decimal': {
      if (typeof v === 'boolean' || (typeof v === 'string' && !v.trim())) return undefined
      let n = Number(v)
      if (!Number.isFinite(n) || Math.abs(n) > LIMITS[def.type]) return undefined
      if (def.type === 'int' || def.type === 'ref') n = Math.round(n)
      if (def.type === 'money') n = Math.round(n * 100) / 100
      if (def.type === 'ref' && n <= 0) return undefined
      if (def.type !== 'ref' && ((def.min !== undefined && n < def.min) || (def.max !== undefined && n > def.max))) return undefined
      return n
    }
    case 'bool':
      if (typeof v === 'boolean') return v
      if (v === 'true' || v === 1 || v === '1') return true
      if (v === 'false' || v === 0 || v === '0') return false
      return undefined
    case 'weekdays': {
      if (!Array.isArray(v)) return undefined
      const days = v.map(Number)
      if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return undefined
      return [...new Set(days)].sort()
    }
    case 'date':
      return isDate(v) ? v : undefined
    case 'time':
      return normTime(v) ?? undefined
    case 'datetime':
      return normDateTime(v) ?? undefined
  }
}

function problem(def: FieldDef): string {
  switch (def.type) {
    case 'text':
      if (def.format === 'color') return 'ожидается цвет вида #a1b2c3'
      if (def.format === 'email') return 'неверный email'
      return def.required ? `обязательно, до ${def.max} символов` : `не длиннее ${def.max} символов`
    case 'enum':
      return `допустимо: ${def.values.join(', ')}`
    case 'int':
    case 'real':
    case 'money':
    case 'decimal': {
      const range = [def.min !== undefined ? `от ${def.min}` : '', def.max !== undefined ? `до ${def.max}` : ''].filter(Boolean).join(' ')
      return `ожидается число${range ? ` ${range}` : ''}`
    }
    case 'ref':
      return 'ожидается id записи'
    case 'bool':
      return 'ожидается да или нет'
    case 'weekdays':
      return 'ожидается список дней недели от 1 до 7'
    case 'date':
      return 'ожидается дата ГГГГ-ММ-ДД'
    case 'time':
      return 'ожидается время ЧЧ:ММ'
    case 'datetime':
      return 'ожидается дата и время ГГГГ-ММ-ДДTЧЧ:ММ'
  }
}

export interface NormalizeOptions {
  /** Обновление: проверяются только переданные поля. */
  partial?: boolean
  /** Восстановление из копии: неподходящие значения становятся пустыми вместо ошибки. */
  lenient?: boolean
  /** Оставить служебные колонки (для кода сервера). */
  internal?: boolean
}

/**
 * Проверяет и нормализует запись для таблицы. Неизвестные поля отбрасываются,
 * пустые строки становятся null. Бросает ValidationError на первом неверном поле.
 */
export function normalizeRecord(table: TableName, body: Record<string, unknown>, opts: NormalizeOptions = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [col, def] of fieldsOf(table)) {
    if (!opts.internal && (internalColumns as readonly string[]).includes(col)) continue
    const present = Object.hasOwn(body, col) && body[col] !== undefined
    const required = 'required' in def && def.required && !opts.lenient
    if (!present) {
      if (required && !opts.partial) throw new ValidationError(col, `Поле «${col}»: ${problem(def)}`)
      continue
    }
    const raw = body[col]
    if (raw === null || raw === '') {
      if (required) throw new ValidationError(col, `Поле «${col}»: ${problem(def)}`)
      out[col] = null
      continue
    }
    const value = coerce(def, raw)
    if (value === undefined) {
      if (opts.lenient && !required) {
        out[col] = null
        continue
      }
      throw new ValidationError(col, `Поле «${col}»: ${problem(def)}`)
    }
    out[col] = value
  }
  return out
}
