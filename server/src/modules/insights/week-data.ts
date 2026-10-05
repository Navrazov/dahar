import { query } from '../../db/pool.ts'
import { addDays } from '../../lib/time.ts'
import { getSetting } from '../settings/settings.repository.ts'

/**
 * Что происходило за неделю — компактно, только то, что нужно для разбора.
 * Тексты обрезаны, чтобы запрос был небольшим и дешёвым.
 */
export interface WeekData {
  week: { start: string; end: string }
  currency: string
  tasks: { done: string[]; overdue: string[]; open_this_week: number; done_previous_week: number }
  habits: { name: string; kind: string; done: number; slips: number }[]
  money: {
    income: number
    expense: number
    previous_expense: number
    top_expenses: { category: string; amount: number; previous: number }[]
    budgets_over: { category: string; limit: number; spent: number }[]
  }
  projects: { name: string; status: string | null; tasks_done_this_week: number; open_tasks: number }[]
  review: { wins: string | null; problems: string | null; focus: string | null; rating: number | null } | null
}

const clip = (s: unknown, n = 120) => String(s ?? '').slice(0, n)

export async function collectWeek(userId: number, start: string): Promise<WeekData> {
  const end = addDays(start, 6)
  const prevStart = addDays(start, -7)
  const prevEnd = addDays(start, -1)
  const [done, overdue, counts, habits, money, cats, budgets, projects, review] = await Promise.all([
    query(`SELECT title FROM tasks WHERE user_id = $1 AND status = 'done' AND completed_at::date BETWEEN $2 AND $3 ORDER BY completed_at LIMIT 40`, [
      userId,
      start,
      end,
    ]),
    query(`SELECT title FROM tasks WHERE user_id = $1 AND status IS DISTINCT FROM 'done' AND due_date < $2 ORDER BY due_date LIMIT 20`, [userId, end]),
    query(
      `SELECT
         count(*) FILTER (WHERE status IS DISTINCT FROM 'done' AND due_date BETWEEN $2 AND $3)::int AS open_this_week,
         count(*) FILTER (WHERE status = 'done' AND completed_at::date BETWEEN $4 AND $5)::int AS done_previous_week
       FROM tasks WHERE user_id = $1`,
      [userId, start, end, prevStart, prevEnd],
    ),
    query(
      `SELECT h.name, h.kind,
              count(l.*) FILTER (WHERE l.status = 'done')::int AS done,
              count(l.*) FILTER (WHERE l.status = 'slip')::int AS slips
       FROM habits h LEFT JOIN habit_logs l ON l.habit_id = h.id AND l.date BETWEEN $2 AND $3
       WHERE h.user_id = $1 AND h.archived IS NOT TRUE GROUP BY h.id ORDER BY h.id LIMIT 20`,
      [userId, start, end],
    ),
    query(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE kind = 'income' AND date BETWEEN $2 AND $3), 0) AS income,
              COALESCE(SUM(amount) FILTER (WHERE kind = 'expense' AND date BETWEEN $2 AND $3), 0) AS expense,
              COALESCE(SUM(amount) FILTER (WHERE kind = 'expense' AND date BETWEEN $4 AND $5), 0) AS previous_expense
       FROM transactions WHERE user_id = $1`,
      [userId, start, end, prevStart, prevEnd],
    ),
    query(
      `SELECT COALESCE(NULLIF(category, ''), 'Без категории') AS category,
              COALESCE(SUM(amount) FILTER (WHERE date BETWEEN $2 AND $3), 0) AS amount,
              COALESCE(SUM(amount) FILTER (WHERE date BETWEEN $4 AND $5), 0) AS previous
       FROM transactions WHERE user_id = $1 AND kind = 'expense' AND date BETWEEN $4 AND $3
       GROUP BY 1 ORDER BY 2 DESC LIMIT 6`,
      [userId, start, end, prevStart, prevEnd],
    ),
    query(
      `SELECT b.category, b.amount AS limit,
              COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.user_id = b.user_id AND t.kind = 'expense'
                        AND lower(t.category) = lower(b.category)
                        AND t.date >= date_trunc('month', $2::date) AND t.date <= $2::date), 0) AS spent
       FROM budgets b WHERE b.user_id = $1`,
      [userId, end],
    ),
    query(
      `SELECT p.name, p.status,
              count(t.*) FILTER (WHERE t.status = 'done' AND t.completed_at::date BETWEEN $2 AND $3)::int AS tasks_done_this_week,
              count(t.*) FILTER (WHERE t.status IS DISTINCT FROM 'done')::int AS open_tasks
       FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
       WHERE p.user_id = $1 AND p.status IN ('active', 'paused') GROUP BY p.id ORDER BY p.id LIMIT 12`,
      [userId, start, end],
    ),
    query(`SELECT wins, problems, focus, rating FROM reviews WHERE user_id = $1 AND week_start = $2`, [userId, start]),
  ])
  const r = review.rows[0]
  return {
    week: { start, end },
    currency: String((await getSetting(userId, 'currency')) || '₽'),
    tasks: {
      done: done.rows.map((t) => clip(t.title)),
      overdue: overdue.rows.map((t) => clip(t.title)),
      open_this_week: counts.rows[0].open_this_week,
      done_previous_week: counts.rows[0].done_previous_week,
    },
    habits: habits.rows.map((h) => ({ name: clip(h.name, 60), kind: h.kind ?? 'build', done: h.done, slips: h.slips })),
    money: {
      income: money.rows[0].income,
      expense: money.rows[0].expense,
      previous_expense: money.rows[0].previous_expense,
      top_expenses: cats.rows.filter((c) => c.amount > 0).map((c) => ({ category: clip(c.category, 60), amount: c.amount, previous: c.previous })),
      budgets_over: budgets.rows.filter((b) => b.spent > b.limit).map((b) => ({ category: clip(b.category, 60), limit: b.limit, spent: b.spent })),
    },
    projects: projects.rows.map((p) => ({ name: clip(p.name, 80), status: p.status, tasks_done_this_week: p.tasks_done_this_week, open_tasks: p.open_tasks })),
    review: r
      ? { wins: r.wins && clip(r.wins, 600), problems: r.problems && clip(r.problems, 600), focus: r.focus && clip(r.focus, 400), rating: r.rating }
      : null,
  }
}

export const isEmptyWeek = (d: WeekData) =>
  !d.tasks.done.length && !d.tasks.overdue.length && !d.habits.some((h) => h.done || h.slips) && !d.money.income && !d.money.expense && !d.review
