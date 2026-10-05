import type { BizExpense, Sale } from '@/shared/api'
import { monthKey, sum } from '@/shared/lib'

export const saleProfit = (s: Sale) => (s.amount || 0) - (s.cost || 0)

export function businessMonth(sales: Sale[], expenses: BizExpense[], month: string) {
  const s = sales.filter((x) => monthKey(x.date) === month)
  const e = expenses.filter((x) => monthKey(x.date) === month)
  const revenue = sum(s.map((x) => x.amount))
  const gross = sum(s.map(saleProfit))
  const exp = sum(e.map((x) => x.amount))
  return { revenue, gross, expenses: exp, net: gross - exp, count: s.length }
}
