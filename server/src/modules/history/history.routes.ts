import { Router } from 'express'
import { query, tx, q } from '../../db/pool.ts'
import { tableOrder, fieldsOf, isRef } from '../../db/schema.ts'
import { HttpError, notFound } from '../../lib/errors.ts'

const allowed = new Set<string>([...tableOrder, 'settings', 'statement_imports', 'category_rules'])
const keysOf = (table: string) =>
  table === 'settings'
    ? ['user_id', 'key']
    : table === 'statement_imports'
      ? ['user_id', 'key']
      : table === 'category_rules'
        ? ['user_id', 'kind', 'merchant']
        : ['id']

export function historyRoutes() {
  const r = Router()
  r.get('/', async (req, res) => {
    const { rows } = await query(
      `SELECT a.id,a.label,a.created_at,a.undone_at FROM history_actions a WHERE a.user_id=$1
      AND EXISTS(SELECT 1 FROM history_changes c WHERE c.action_id=a.id) ORDER BY a.id DESC LIMIT 30`,
      [req.user.id],
    )
    res.json(rows)
  })
  r.post('/:id/undo', async (req, res) => {
    if (!/^\d+$/.test(String(req.params.id)) || !Number.isSafeInteger(Number(req.params.id)) || Number(req.params.id) < 1) throw notFound()
    await tx(async (c) => {
      await query('SELECT pg_advisory_xact_lock($1,$2)', [7262005, req.user.id], c)
      const action = (await query('SELECT * FROM history_actions WHERE id=$1 AND user_id=$2 FOR UPDATE', [req.params.id, req.user.id], c)).rows[0]
      if (!action) throw notFound()
      if (action.undone_at) return
      await query('SET CONSTRAINTS ALL DEFERRED', [], c)
      const changes = (await query('SELECT * FROM history_changes WHERE action_id=$1 ORDER BY id DESC', [action.id], c)).rows
      for (const change of changes) {
        const table = change.table_name as string
        if (!allowed.has(table)) throw new Error('Unknown history table')
        const row = change.after_row ?? change.before_row
        if (table === 'settings' && ['currency', 'trading_currency'].includes(row.key)) {
          const fallback = row.key === 'currency' ? '₽' : '$'
          if ((change.before_row?.value ?? fallback) !== (change.after_row?.value ?? fallback)) {
            const tables = row.key === 'currency' ? ['transactions', 'sales', 'biz_expenses', 'accounts', 'products', 'budgets'] : ['trades']
            for (const related of tables)
              if ((await query(`SELECT 1 FROM ${q(related)} WHERE user_id=$1 LIMIT 1`, [req.user.id], c)).rowCount)
                throw new HttpError(409, 'В аккаунте появились суммы. Отмена смены валюты требует конвертации')
          }
        }
        const keys = keysOf(table)
        const where = keys.map((k, i) => `${q(k)}=$${i + 1}`).join(' AND ')
        const args = keys.map((k) => row[k])
        const current = (await query(`SELECT to_jsonb(t) AS row FROM ${q(table)} t WHERE ${where} FOR UPDATE`, args, c)).rows[0]?.row ?? null
        if (JSON.stringify(current) !== JSON.stringify(change.after_row))
          throw new HttpError(409, 'Запись уже изменена. Отмена затронула бы более новые данные')
        if (!change.before_row) {
          for (const related of tableOrder)
            for (const [col, def] of fieldsOf(related))
              if (isRef(def) && def.ref === table) {
                if ((await query(`SELECT 1 FROM ${q(related)} WHERE ${q(col)}=$1 LIMIT 1`, [row.id], c)).rowCount)
                  throw new HttpError(409, 'У записи появились зависимые данные. Сначала отмените их изменения')
              }
          if (table === 'transactions' && (await query('SELECT 1 FROM statement_imports WHERE transaction_id=$1 LIMIT 1', [row.id], c)).rowCount)
            throw new HttpError(409, 'У записи появились зависимые данные')
          await query(`DELETE FROM ${q(table)} WHERE ${where}`, args, c)
        } else {
          // Existing columns only: history remains readable after additive schema changes.
          const cols = (await query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [table], c)).rows
            .map((x) => x.column_name as string)
            .filter((k) => Object.hasOwn(change.before_row, k))
          await query(
            `INSERT INTO ${q(table)} (${cols.map(q).join(',')}) SELECT ${cols.map(q).join(',')} FROM jsonb_populate_record(NULL::${q(table)},$1::jsonb)
            ON CONFLICT (${(tableOrder.includes(table as never) ? ['id'] : keys).map(q).join(',')}) DO UPDATE SET ${cols
              .filter((k) => !keys.includes(k))
              .map((k) => `${q(k)}=EXCLUDED.${q(k)}`)
              .join(',')}`,
            [JSON.stringify(change.before_row)],
            c,
          )
        }
      }
      if (
        (
          await query(
            "SELECT 1 FROM tasks WHERE user_id=$1 AND focus_date IS NOT NULL AND status IS DISTINCT FROM 'done' GROUP BY focus_date HAVING count(*)>3 LIMIT 1",
            [req.user.id],
            c,
          )
        ).rowCount
      )
        throw new HttpError(409, 'Отмена добавит четвёртую главную задачу. Сначала освободите место')
      await query('UPDATE history_actions SET undone_at=now() WHERE id=$1', [action.id], c)
    }).catch((error: Error & { code?: string }) => {
      if (['23503', '23505'].includes(error.code ?? '')) throw new HttpError(409, 'Отмена конфликтует с более новыми данными')
      throw error
    })
    res.json({ ok: true })
  })
  return r
}
