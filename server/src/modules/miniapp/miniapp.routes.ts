import { Router } from 'express'
import { decode } from '../../db/codec.ts'
import { query } from '../../db/pool.ts'
import { badRequest } from '../../lib/errors.ts'
import { addDays, isDate, weekday } from '../../lib/time.ts'
import { userNow } from '../settings/settings.repository.ts'

const pageNumber = (value: unknown, fallback: number, max: number) => {
  if (value === undefined) return fallback
  if (!/^\d{1,7}$/.test(String(value))) throw badRequest('Неверная страница списка')
  return Math.min(Number(value), max)
}
const literal = (value: unknown) =>
  `%${String(value ?? '')
    .trim()
    .slice(0, 100)
    .replace(/[\\%_]/g, '\\$&')}%`

/** Small projections for the daily Telegram flow; every query is scoped to the authenticated owner. */
export function miniappRoutes() {
  const r = Router()
  r.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  r.get('/tasks', async (req, res) => {
    const { date } = await userNow(req.user.id),
      args: unknown[] = [req.user.id, date]
    const limit = Math.max(1, pageNumber(req.query.limit, 50, 100)),
      offset = pageNumber(req.query.offset, 0, 1_000_000)
    const filters: Record<string, string> = {
      open: "status IS DISTINCT FROM 'done'",
      inbox: "status IS DISTINCT FROM 'done' AND COALESCE(planned_date,due_date) IS NULL",
      future: "status IS DISTINCT FROM 'done' AND COALESCE(planned_date,due_date)>$2::date",
      done: "status='done'",
      late: "status IS DISTINCT FROM 'done' AND COALESCE(planned_date,due_date)<$2::date",
      today: "status IS DISTINCT FROM 'done' AND COALESCE(planned_date,due_date)=$2::date",
    }
    const filter = String(req.query.filter ?? 'open')
    if (!filters[filter]) throw badRequest('Неизвестный фильтр задач')
    const conditions = ['user_id=$1', filters[filter]]
    if (String(req.query.q ?? '').trim()) {
      args.push(literal(req.query.q))
      conditions.push(`title ILIKE $${args.length}`)
    }
    if (req.query.project_id !== undefined && req.query.project_id !== '') {
      if (!/^[1-9]\d{0,9}$/.test(String(req.query.project_id)) || Number(req.query.project_id) > 2_147_483_647) throw badRequest('Неверный проект')
      args.push(Number(req.query.project_id))
      conditions.push(`project_id=$${args.length}`)
    }
    // Bind the date in the count as well, including filters that do not compare dates.
    const where = `WHERE ${conditions.join(' AND ')} AND $2::date IS NOT NULL`
    const [items, count] = await Promise.all([
      query(
        `SELECT * FROM tasks ${where} ORDER BY (focus_date=$2::date) DESC NULLS LAST,COALESCE(planned_date,due_date) ASC NULLS LAST,sort_order ASC NULLS LAST,CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'low' THEN 3 ELSE 2 END,id DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
        [...args, limit, offset],
      ),
      query(`SELECT count(*)::int AS total FROM tasks ${where}`, args),
    ])
    res.json({ items: items.rows.map(decode), total: count.rows[0].total, limit, offset, date })
  })
  r.get('/today', async (req, res) => {
    const { date } = await userNow(req.user.id)
    const rows = (
      await query(
        `WITH relevant AS (
      SELECT *,CASE WHEN status='done' THEN 'done' WHEN focus_date=$2::date THEN 'focus' WHEN COALESCE(planned_date,due_date)=$2::date THEN 'today' ELSE 'late' END AS bucket
      FROM tasks WHERE user_id=$1 AND (
        (status IS DISTINCT FROM 'done' AND (focus_date=$2::date OR COALESCE(planned_date,due_date)<=$2::date))
        OR (status='done' AND completed_at>=$2::date AND completed_at<$2::date+1)
      )
    ),ranked AS (
      SELECT *,count(*) OVER(PARTITION BY bucket)::int AS bucket_total,row_number() OVER(PARTITION BY bucket ORDER BY sort_order ASC NULLS LAST,due_date ASC NULLS LAST,due_time ASC NULLS LAST,id DESC) AS position FROM relevant
    ) SELECT * FROM ranked WHERE position<=50 ORDER BY bucket,position`,
        [req.user.id, date],
      )
    ).rows
    const groups: Record<string, { items: unknown[]; total: number }> = {
      focus: { items: [], total: 0 },
      today: { items: [], total: 0 },
      late: { items: [], total: 0 },
      done: { items: [], total: 0 },
    }
    for (const row of rows) {
      const { bucket, bucket_total, position: _, ...task } = row
      groups[bucket].total = bucket_total
      groups[bucket].items.push(decode(task))
    }
    res.json({ date, ...groups })
  })
  r.get('/week', async (req, res) => {
    const week = req.query.week
    if (!isDate(week) || weekday(week) !== 1) throw badRequest('Ожидается понедельник недели')
    const { date } = await userNow(req.user.id),
      end = addDays(week, 6)
    const counts = (
      await query(
        `SELECT
      count(*) FILTER(WHERE status='done' AND completed_at>=$2::date AND completed_at<$2::date+7)::int AS completed,
      count(*) FILTER(WHERE status IS DISTINCT FROM 'done' AND due_date>=$2::date AND due_date<=$3::date)::int AS remaining_due
      FROM tasks WHERE user_id=$1`,
        [req.user.id, week, end < date ? end : date],
      )
    ).rows[0]
    res.json({ week, ...counts })
  })
  r.get('/project-counts', async (req, res) => {
    res.json(
      (
        await query(
          `SELECT project_id,count(*)::int AS total,count(*) FILTER(WHERE status='done')::int AS done FROM tasks WHERE user_id=$1 AND project_id IS NOT NULL GROUP BY project_id`,
          [req.user.id],
        )
      ).rows,
    )
  })
  return r
}
