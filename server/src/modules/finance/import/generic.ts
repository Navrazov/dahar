import { parseAmount } from './read.ts'
import type { ParsedRow } from './types.ts'

/**
 * Выписка любого банка в CSV: колонки узнаём по названиям. Так читаются выгрузки Альфы, ВТБ и других банков,
 * у которых есть дата, сумма (или «приход» и «расход») и описание. Перед сохранением человек всё равно видит список.
 */

const DATE = /^(дата( и время)?( операции| проводки| совершения| транзакции)?|date|transaction date)$/i
const AMOUNT = /^(сумма( операции| в валюте счёта| в валюте счета| платежа)?|amount)$/i
const INCOME = /^(приход|зачислени[ея]|поступлени[ея]|кредит|credit|income)$/i
const EXPENSE = /^(расход|списани[ея]|дебет|debit|expense)$/i
const DESCRIPTION = /^(описание( операции)?|назначение( платежа)?|контрагент|получатель|комментарий|детали|description|details|payee)$/i
const CATEGORY = /^(категория|category)$/i
const STATUS = /^(статус|status)$/i

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

interface Columns {
  header: number
  date: number
  amount: number
  income: number
  expense: number
  description: number
  category: number
  status: number
  currency: number
}

function findColumns(rows: string[][]): Columns | null {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const head = rows[i].map(norm)
    const find = (re: RegExp) => head.findIndex((c) => re.test(c))
    const cols = {
      header: i,
      date: find(DATE),
      amount: find(AMOUNT),
      income: find(INCOME),
      expense: find(EXPENSE),
      description: find(DESCRIPTION),
      category: find(CATEGORY),
      status: find(STATUS),
      currency: find(/^(валюта( операции| платежа| сч[её]та)?|currency)$/i),
    }
    if (cols.date >= 0 && (cols.amount >= 0 || (cols.income >= 0 && cols.expense >= 0))) return cols
  }
  return null
}

export const isGenericCsv = (rows: string[][]) => findColumns(rows) !== null

/** dd.mm.yyyy, dd.mm.yy, yyyy-mm-dd, dd/mm/yyyy — с временем или без. */
export function anyDate(raw: string): { date: string; time: string } | null {
  const s = norm(raw)
  let m = /^(\d{2})[./](\d{2})[./](\d{4}|\d{2})(?!\d)(?:[ ,T]+(\d{1,2}):(\d{2}))?/.exec(s)
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3]
    return { date: `${year}-${m[2]}-${m[1]}`, time: m[4] ? `${m[4].padStart(2, '0')}:${m[5]}` : '' }
  }
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s)
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${m[4]}:${m[5]}` : '' }
  return null
}

const cell = (r: string[], i: number) => (i >= 0 ? norm(r[i] ?? '') : '')

/** Сумма может прийти с валютой: «1 350,00 ₽», «-500 RUB». */
const money = (s: string) => (s ? parseAmount(s.replace(/[^\d\s,.\-−+]/g, '')) : null)

export function parseGeneric(rows: string[][]): ParsedRow[] {
  const cols = findColumns(rows)
  if (!cols) return []
  const out: ParsedRow[] = []
  for (const r of rows.slice(cols.header + 1)) {
    if (/отклон|отмен|declined|failed|rejected/i.test(cell(r, cols.status))) continue
    const when = anyDate(cell(r, cols.date))
    if (!when || Number.isNaN(Date.parse(when.date))) continue
    let amount: number | null
    if (cols.amount >= 0) amount = money(cell(r, cols.amount))
    else {
      const inc = money(cell(r, cols.income)) ?? 0
      const exp = money(cell(r, cols.expense)) ?? 0
      amount = inc ? Math.abs(inc) : exp ? -Math.abs(exp) : null
    }
    if (!amount) continue
    out.push({
      date: when.date,
      time: when.time,
      kind: amount < 0 ? 'expense' : 'income',
      amount: Math.abs(amount),
      currency: cell(r, cols.currency) || /(?:RUB|USD|EUR|GBP|CNY|₽|\$|€|£|¥)/i.exec(cell(r, cols.amount))?.[0] || '',
      description: cell(r, cols.description),
      bank_category: cell(r, cols.category),
      mcc: '',
    })
  }
  return out
}
