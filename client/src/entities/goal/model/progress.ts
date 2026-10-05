import { useCallback } from 'react'
import { useFinanceSummary, useList, useSettings, type Goal } from '@/shared/api'
import { monthKey, sum, todayStr } from '@/shared/lib'
import { businessMonth } from '@/entities/business/@x/goal'
import { netPnl, tradingStats } from '@/entities/trade/@x/goal'

export function useGoalValue() {
  const settings = useSettings()
  const tasks = useList('tasks')
  const partners = useList('partners')
  const reports = useList('partner_reports')
  const sales = useList('sales')
  const bizExp = useList('biz_expenses')
  const trades = useList('trades')
  const topics = useList('trading_topics')
  const accounts = useList('accounts')
  const month = todayStr().slice(0, 7)
  const summary = useFinanceSummary(month)

  return useCallback(
    (g: Goal): number => {
      const balance = (kind: string) =>
        sum(accounts.filter((a) => a.kind === kind && !a.archived).map((a) => summary?.balances.find((b) => b.account_id === a.id)?.balance ?? 0))
      const monthReports = reports.filter((r) => monthKey(r.date) === month)
      switch (g.metric) {
        case 'project_tasks_done':
          return tasks.filter((t) => t.project_id === g.project_id && t.status === 'done').length
        case 'partners_active':
          return partners.filter((p) => p.status === 'active').length
        case 'partners_total':
          return partners.length
        case 'partner_applications_month':
          return sum(monthReports.map((r) => r.applications))
        case 'partner_turnover_month':
          return sum(monthReports.map((r) => r.turnover))
        case 'business_net_month':
          return businessMonth(sales, bizExp, month).net
        case 'business_revenue_month':
          return businessMonth(sales, bizExp, month).revenue
        case 'business_sales_month':
          return businessMonth(sales, bizExp, month).count
        case 'trading_pnl_total':
          return tradingStats(trades, 0).totalPnl
        case 'trading_pnl_month':
          return sum(trades.filter((t) => t.pnl != null && monthKey(t.date) === month).map(netPnl))
        case 'trading_balance':
          return tradingStats(trades, settings.trading_start_balance ?? 0).balance
        case 'trading_topics_done':
          return topics.filter((t) => t.status === 'done').length
        case 'finance_savings':
          return balance('savings')
        case 'finance_investments':
          return balance('investment')
        case 'finance_net_month':
          return (summary?.income ?? 0) - (summary?.expense ?? 0)
        default:
          return g.current_value ?? 0
      }
    },
    [settings, tasks, partners, reports, sales, bizExp, trades, topics, accounts, summary, month],
  )
}

export function useGoalProgress() {
  const value = useGoalValue()
  return useCallback(
    (g: Goal) => {
      if (g.status === 'done') return 1
      if (!g.target_value) return 0
      return Math.max(0, Math.min(1, value(g) / g.target_value))
    },
    [value],
  )
}
