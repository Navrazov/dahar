import { query } from '../../db/pool.js'
import { addMonths } from '../../lib/time.js'

export async function financeSummary(userId, month) {
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
    `SELECT substr(date, 1, 7) AS month,
            COALESCE(SUM(amount) FILTER (WHERE kind = 'income'), 0) AS income,
            COALESCE(SUM(amount) FILTER (WHERE kind = 'expense'), 0) AS expense
     FROM transactions
     WHERE user_id = $1 AND substr(date, 1, 7) BETWEEN $2 AND $3
     GROUP BY 1`,
    [userId, from, month],
  )
  const byMonth = new Map(months.rows.map((r) => [r.month, r]))
  const series = Array.from({ length: 12 }, (_, i) => {
    const m = addMonths(`${from}-01`, i).slice(0, 7)
    const r = byMonth.get(m)
    return { month: m, income: r?.income ?? 0, expense: r?.expense ?? 0 }
  })

  const categories = await query(
    `SELECT kind, COALESCE(NULLIF(category, ''), 'Без категории') AS category, SUM(amount) AS amount
     FROM transactions
     WHERE user_id = $1 AND substr(date, 1, 7) = $2 AND kind IN ('income', 'expense')
     GROUP BY 1, 2 ORDER BY 3 DESC`,
    [userId, month],
  )

  const budgets = await query(
    `SELECT b.id, b.category, b.amount,
            COALESCE((SELECT SUM(t.amount) FROM transactions t
                      WHERE t.user_id = b.user_id AND t.kind = 'expense' AND substr(t.date, 1, 7) = $2
                        AND lower(t.category) = lower(b.category)), 0) AS spent
     FROM budgets b WHERE b.user_id = $1 ORDER BY b.category`,
    [userId, month],
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

export async function budgetStatus(userId, category, month) {
  if (!category) return null
  const { rows } = await query(
    `SELECT b.amount,
            COALESCE((SELECT SUM(amount) FROM transactions
                      WHERE user_id = $1 AND kind = 'expense' AND substr(date, 1, 7) = $3 AND lower(category) = lower($2)), 0) AS spent
     FROM budgets b WHERE b.user_id = $1 AND lower(b.category) = lower($2)`,
    [userId, category, month],
  )
  return rows[0] ? { category, limit: rows[0].amount, spent: rows[0].spent } : null
}
