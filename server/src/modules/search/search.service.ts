import { query, q } from '../../db/pool.ts'
import { dateColumn, fieldsOf, tableOrder, type TableName } from '../../db/schema.ts'

/** Что показывать заголовком найденной записи; у таблиц без имени — самое осмысленное поле. */
const titleSql: Partial<Record<TableName, string>> = {
  partner_reports: `COALESCE(note, 'Отчёт партнёра')`,
  partner_interactions: `COALESCE(note, 'Взаимодействие')`,
  trades: `COALESCE(instrument, 'Сделка')`,
  sales: `COALESCE(note, 'Продажа')`,
  biz_expenses: `COALESCE(note, category, 'Расход')`,
  transactions: `COALESCE(note, category, 'Операция')`,
  budgets: 'category',
  reviews: `'Итоги недели'`,
}

/** В поиск не попадают служебные отметки привычек — у них нет текста. */
const skip = new Set<TableName>(['habit_logs'])

const textColumns = (t: TableName) => fieldsOf(t).filter(([, def]) => def.type === 'text' && !('format' in def && def.format === 'color'))

export interface SearchHit {
  table: TableName
  id: number
  title: string
  snippet: string | null
  date: string | null
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

export async function search(userId: number, raw: string, perTable = 5): Promise<SearchHit[]> {
  const text = raw.trim().slice(0, 100)
  if (text.length < 2) return []
  const parts: string[] = []
  for (const t of tableOrder) {
    if (skip.has(t)) continue
    const cols = textColumns(t).map(([c]) => q(c))
    if (!cols.length) continue
    const doc = `concat_ws(' ', ${cols.join(', ')})`
    const title = titleSql[t] ?? cols[0]
    const dc = dateColumn[t]
    parts.push(`(SELECT '${t}' AS "table", id, ${title} AS title, left(${doc}, 300) AS doc,
        ${dc ? `${q(dc)}::text` : 'NULL'} AS date, created_at
      FROM ${q(t)} WHERE user_id = $1 AND ${doc} ILIKE $2
      ORDER BY (${title} ILIKE $3) DESC, created_at DESC LIMIT ${perTable})`)
  }
  const pattern = `%${escapeLike(text)}%`
  const { rows } = await query(parts.join('\nUNION ALL\n'), [userId, pattern, `${escapeLike(text)}%`])
  const lower = text.toLowerCase()
  return rows.map((r) => {
    const doc = String(r.doc ?? '')
    const at = doc.toLowerCase().indexOf(lower)
    const inTitle = String(r.title ?? '')
      .toLowerCase()
      .includes(lower)
    const snippet = !inTitle && at >= 0 ? `${at > 30 ? '…' : ''}${doc.slice(Math.max(0, at - 30), at + text.length + 50).trim()}` : null
    return { table: r.table, id: r.id, title: String(r.title ?? ''), snippet, date: r.date ? String(r.date).slice(0, 10) : null }
  })
}
