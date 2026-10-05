import { describe, expect, it } from 'vitest'
import { row } from '@/shared/testing'
import { businessMonth, saleProfit } from './stats'

describe('businessMonth', () => {
  it('sums revenue, margin and expenses for the month only', () => {
    const sales = [
      row('sales', { date: '2026-10-02', amount: 1000, cost: 600 }),
      row('sales', { date: '2026-10-20', amount: 500, cost: null }),
      row('sales', { date: '2026-09-30', amount: 9999, cost: 0 }),
    ]
    const expenses = [row('biz_expenses', { date: '2026-10-05', amount: 150 }), row('biz_expenses', { date: '2026-11-01', amount: 999 })]
    expect(businessMonth(sales, expenses, '2026-10')).toEqual({ revenue: 1500, gross: 900, expenses: 150, net: 750, count: 2 })
    expect(saleProfit(sales[0])).toBe(400)
  })
})
