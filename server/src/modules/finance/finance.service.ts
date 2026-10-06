import { query, type DbRow } from '../../db/pool.ts'
import { addMonths } from '../../lib/time.ts'

/** Условие «дата попадает в месяцы from..to» — работает по индексу. */
const inMonths = (col: string, from: string, to: string) => `${col} >= ${from}::date AND ${col} < ${to}::date + interval '1 month'`

export async function financeSummary(userId: number, month: string) {
  const from = addMonths(`${month}-01`, -11).slice(0, 7)

  const balances = await query(
    `SELECT a.id AS account_id,
            COALESCE(a.initial_balance, 0)
            + COALESCE(SUM(CASE WHEN t.account_id = a.id AND t.kind = 'income' THEN t.amount
                                WHEN t.account_id = a.id THEN -t.amount
                                WHEN t.to_account_id = a.id AND t.kind = 'transfer' THEN t.amount
                                ELSE 0 END), 0) AS balance
     FROM accounts a
     LEFT JOIN transactions t ON t.user_id = a.user_id AND (t.account_id = a.id OR t.to_account_id = a.id)
     WHERE a.user_id = $1
     GROUP BY a.id`,
    [userId],
  )

  const months = await query(
    `SELECT to_char(date, 'YYYY-MM') AS month,
            COALESCE(SUM(amount) FILTER (WHERE kind = 'income'), 0) AS income,
            COALESCE(SUM(amount) FILTER (WHERE kind = 'expense'), 0) AS expense
     FROM transactions
     WHERE user_id = $1 AND ${inMonths('date', '$2', '$3')}
     GROUP BY 1`,
    [userId, `${from}-01`, `${month}-01`],
  )
  const byMonth = new Map<string, DbRow>(months.rows.map((r) => [r.month, r]))
  const series = Array.from({ length: 12 }, (_, i) => {
    const m = addMonths(`${from}-01`, i).slice(0, 7)
    const r = byMonth.get(m)
    return { month: m, income: r?.income ?? 0, expense: r?.expense ?? 0 }
  })

  const categories = await query(
    `SELECT kind, COALESCE(NULLIF(category, ''), 'Без категории') AS category, SUM(amount) AS amount
     FROM transactions
     WHERE user_id = $1 AND ${inMonths('date', '$2', '$2')} AND kind IN ('income', 'expense')
     GROUP BY 1, 2 ORDER BY 3 DESC`,
    [userId, `${month}-01`],
  )

  const budgets = await query(
    `SELECT b.id, b.category, b.amount,
            COALESCE((SELECT SUM(t.amount) FROM transactions t
                      WHERE t.user_id = b.user_id AND t.kind = 'expense' AND ${inMonths('t.date', '$2', '$2')}
                        AND lower(regexp_replace(btrim(t.category),'[[:space:]]+',' ','g')) = lower(regexp_replace(btrim(b.category),'[[:space:]]+',' ','g'))), 0) AS spent
     FROM budgets b WHERE b.user_id = $1 ORDER BY b.category`,
    [userId, `${month}-01`],
  )

  const current = series[series.length - 1]
  return {
    month,
    income: current.income,
    expense: current.expense,
    balances: balances.rows,
    months: series,
    expenseCategories: categories.rows.filter((r) => r.kind === 'expense').map(({ category, amount }) => ({ category, amount })),
    incomeCategories: categories.rows.filter((r) => r.kind === 'income').map(({ category, amount }) => ({ category, amount })),
    budgets: budgets.rows,
  }
}

export async function budgetStatus(userId: number, category: string | null, month: string) {
  if (!category) return null
  const { rows } = await query(
    `SELECT b.amount,
            COALESCE((SELECT SUM(amount) FROM transactions
                      WHERE user_id = $1 AND kind = 'expense' AND ${inMonths('date', '$3', '$3')} AND lower(regexp_replace(btrim(category),'[[:space:]]+',' ','g')) = lower(regexp_replace(btrim($2),'[[:space:]]+',' ','g'))), 0) AS spent
     FROM budgets b WHERE b.user_id = $1 AND lower(regexp_replace(btrim(b.category),'[[:space:]]+',' ','g')) = lower(regexp_replace(btrim($2),'[[:space:]]+',' ','g'))`,
    [userId, category, `${month}-01`],
  )
  return rows[0] ? { category, limit: rows[0].amount, spent: rows[0].spent } : null
}
