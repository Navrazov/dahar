import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { encode, type Encoded } from '../../db/codec.ts'
import { query, type DbRow } from '../../db/pool.ts'
import type { TableName } from '../../db/schema.ts'
import { badRequest } from '../../lib/errors.ts'
import { nextDueDate } from '../../lib/recurrence.ts'
import { userNow } from '../settings/settings.repository.ts'
import { insertRow } from './records.repository.ts'

const carriedOver = ['title', 'description', 'due_time', 'priority', 'project_id', 'partner_id', 'goal_id', 'repeat', 'repeat_days', 'repeat_interval']

async function spawnNextOccurrence(task: DbRow, client: PoolClient, userId: number) {
  if (task.status !== 'done' || !task.repeat || task.repeat_spawned) return
  const { date } = await userNow(userId, client)
  const due = nextDueDate(task, date)
  if (!due) return
  const copy = Object.fromEntries(carriedOver.map((col) => [col, task[col]]))
  await insertRow('tasks', encode('tasks', { ...copy, due_date: due, status: 'todo' }, { lenient: true }), userId, client)
  await query('UPDATE tasks SET repeat_spawned = true WHERE id = $1', [task.id], client)
}

async function adjustStock(client: PoolClient, userId: number, productId: number | null, delta: number) {
  if (!productId || !delta) return
  await query('UPDATE products SET stock = COALESCE(stock, 0) + $1 WHERE id = $2 AND user_id = $3', [delta, productId, userId], client)
}

const rescheduled = (data: Encoded, prev: DbRow | null) =>
  prev && (('due_date' in data && data.due_date !== prev.due_date) || ('due_time' in data && data.due_time !== prev.due_time))

export interface Hooks {
  beforeWrite?(data: Encoded, prev: DbRow | null, client: PoolClient, userId: number): Promise<void>
  afterCreate?(row: DbRow, client: PoolClient, userId: number): Promise<void>
  afterUpdate?(row: DbRow, prev: DbRow, client: PoolClient, userId: number): Promise<void>
  afterDelete?(prev: DbRow, client: PoolClient, userId: number): Promise<void>
}

export const hooks: Partial<Record<TableName, Hooks>> = {
  tasks: {
    async beforeWrite(data, prev, client, userId) {
      const row = { ...prev, ...data }
      if (row.focus_date && row.status !== 'done' && (row.focus_date !== prev?.focus_date || prev?.status === 'done')) {
        const n = (
          await query(
            "SELECT count(*)::int AS n FROM tasks WHERE user_id=$1 AND focus_date=$2 AND status IS DISTINCT FROM 'done' AND id<>$3",
            [userId, row.focus_date, prev?.id ?? 0],
            client,
          )
        ).rows[0].n
        if (n >= 3) throw badRequest('На день можно выбрать до трёх главных задач')
      }
      if ('status' in data && data.status !== prev?.status) {
        data.completed_at = data.status === 'done' ? data.completed_at || (await userNow(userId, client)).stamp : null
      }
      if (rescheduled(data, prev)) {
        data.reminded_at = null
        await query('DELETE FROM notification_deliveries WHERE user_id=$1 AND key LIKE $2', [userId, `task:${prev!.id}:%`], client)
      }
    },
    afterCreate: spawnNextOccurrence,
    afterUpdate: (row, _prev, client, userId) => spawnNextOccurrence(row, client, userId),
  },
  transactions: {
    async beforeWrite(data, prev) {
      const row = { ...prev, ...data }
      if (row.kind === 'transfer' && (!row.account_id || !row.to_account_id || row.account_id === row.to_account_id))
        throw badRequest('Для перевода выберите два разных счёта')
      if (row.kind !== 'transfer') data.to_account_id = null
    },
  },
  events: {
    async beforeWrite(data, prev, client, userId) {
      if (!prev && !data.external_uid) data.external_uid = randomUUID() + '@dahar'
      if (data.external_uid && /[\r\n]/.test(String(data.external_uid))) throw badRequest('Некорректный идентификатор события')
      if (
        data.external_uid &&
        (await query('SELECT 1 FROM events WHERE user_id=$1 AND external_uid=$2 AND id<>$3', [userId, data.external_uid, prev?.id ?? 0], client)).rowCount
      )
        throw badRequest('Это событие уже существует')
      const row = { ...prev, ...data }
      if (row.end && row.start && row.end < row.start) throw badRequest('Окончание раньше начала')
    },
  },
  goals: {
    async beforeWrite(data, prev) {
      if ('metric' in data && ['finance_savings', 'finance_investments', 'trading_balance'].includes(String(data.metric))) {
        data.project_id = null
        data.period_start = null
        data.period_end = null
      }
      const row = { ...prev, ...data }
      if (row.period_start && row.period_end && row.period_end < row.period_start) throw badRequest('Конец периода раньше начала')
      if (row.target_value != null && row.target_value <= 0) throw badRequest('Целевое значение должно быть больше нуля')
    },
  },
  sales: {
    afterCreate: (row, client, userId) => adjustStock(client, userId, row.product_id, -(row.quantity || 0)),
    async afterUpdate(row, prev, client, userId) {
      await adjustStock(client, userId, prev.product_id, prev.quantity || 0)
      await adjustStock(client, userId, row.product_id, -(row.quantity || 0))
    },
    afterDelete: (prev, client, userId) => adjustStock(client, userId, prev.product_id, prev.quantity || 0),
  },
}
