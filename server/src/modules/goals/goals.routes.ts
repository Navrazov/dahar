import { Router } from 'express'
import { query } from '../../db/pool.ts'
import { userNow } from '../settings/settings.repository.ts'
import { financeSummary } from '../finance/finance.service.ts'

/** The API calculates goal values over the chosen period and project, without downloading history. */
export function goalValueRoutes() {
  const r = Router()
  r.get('/', async (req, res) => {
    const today = (await userNow(req.user.id)).date
    const goals = (await query('SELECT * FROM goals WHERE user_id=$1', [req.user.id])).rows
    const summary = goals.some((g) => ['finance_savings', 'finance_investments'].includes(g.metric))
      ? await financeSummary(req.user.id, today.slice(0, 7))
      : null
    const values: Record<number, number> = {}
    for (const g of goals) {
      const monthly = String(g.metric || '').endsWith('_month')
      const snapshot = ['finance_savings', 'finance_investments', 'trading_balance'].includes(g.metric)
      const from = (snapshot ? null : g.period_start) || (monthly ? today.slice(0, 7) + '-01' : '0001-01-01')
      const to = (snapshot ? null : g.period_end) || (monthly ? today : '9999-12-31')
      const args = [req.user.id, from, to, snapshot ? null : g.project_id]
      const scope = 'user_id=$1 AND ($4::integer IS NULL OR project_id=$4)'
      const dated = (col: string) => `${scope} AND ${col}::date BETWEEN $2::date AND $3::date`
      let sql: string | null = null
      switch (g.metric) {
        case 'project_tasks_done':
          sql = `SELECT count(*) AS n FROM tasks WHERE ${dated('completed_at')} AND status='done'`
          break
        case 'partners_active':
          sql = `SELECT count(*) AS n FROM partners WHERE ${scope} AND status='active' AND created_at::date BETWEEN $2 AND $3`
          break
        case 'partners_total':
          sql = `SELECT count(*) AS n FROM partners WHERE ${dated('created_at')}`
          break
        case 'partner_applications_month':
        case 'partner_turnover_month':
          sql = `SELECT SUM(${g.metric === 'partner_applications_month' ? 'applications' : 'turnover'}) AS n FROM partner_reports WHERE user_id=$1 AND date BETWEEN $2 AND $3 AND ($4::integer IS NULL OR partner_id IN(SELECT id FROM partners WHERE user_id=$1 AND project_id=$4))`
          break
        case 'business_revenue_month':
          sql = `SELECT SUM(amount) AS n FROM sales WHERE ${dated('date')}`
          break
        case 'business_sales_month':
          sql = `SELECT count(*) AS n FROM sales WHERE ${dated('date')}`
          break
        case 'business_net_month':
          sql = `SELECT (SELECT COALESCE(SUM(amount-COALESCE(cost,0)),0) FROM sales WHERE ${dated('date')})-(SELECT COALESCE(SUM(amount),0) FROM biz_expenses WHERE ${dated('date')}) AS n`
          break
        case 'trading_pnl_total':
        case 'trading_pnl_month':
          sql = `SELECT SUM(pnl-COALESCE(fees,0)) AS n FROM trades WHERE ${dated('date')} AND pnl IS NOT NULL`
          break
        case 'trading_balance':
          sql = `SELECT COALESCE((SELECT (value #>> '{}')::numeric FROM settings WHERE user_id=$1 AND key='trading_start_balance'),0)+COALESCE(SUM(pnl-COALESCE(fees,0)),0) AS n FROM trades WHERE ${dated('date')} AND pnl IS NOT NULL`
          break
        case 'trading_topics_done':
          sql = `SELECT count(*) AS n FROM trading_topics WHERE ${dated('created_at')} AND status='done'`
          break
        case 'finance_net_month':
          sql = `SELECT SUM(CASE WHEN kind='income' THEN amount WHEN kind='expense' THEN -amount ELSE 0 END) AS n FROM transactions WHERE ${dated('date')}`
          break
        case 'finance_savings':
        case 'finance_investments': {
          const kind = g.metric === 'finance_savings' ? 'savings' : 'investment'
          const ids = new Set(
            (await query('SELECT id FROM accounts WHERE user_id=$1 AND kind=$2 AND archived IS NOT TRUE', [req.user.id, kind])).rows.map((a) => a.id),
          )
          values[g.id] = summary!.balances.filter((b) => ids.has(b.account_id)).reduce((a, b) => a + b.balance, 0)
          continue
        }
      }
      values[g.id] = sql ? Number((await query(sql, args)).rows[0]?.n ?? 0) : Number(g.current_value ?? 0)
    }
    res.json(values)
  })
  return r
}
