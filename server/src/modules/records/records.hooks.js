import { encode } from '../../db/codec.js'
import { query } from '../../db/pool.js'
import { nextDueDate } from '../../lib/recurrence.js'
import { userNow } from '../settings/settings.repository.js'
import { insertRow } from './records.repository.js'

const carriedOver = ['title', 'description', 'due_time', 'priority', 'project_id', 'partner_id', 'goal_id', 'repeat', 'repeat_days', 'repeat_interval']

async function spawnNextOccurrence(task, client, userId) {
  if (task.status !== 'done' || !task.repeat || task.repeat_spawned) return
  const { date } = await userNow(userId, client)
  const due = nextDueDate(task, date)
  if (!due) return
  const copy = Object.fromEntries(carriedOver.map((col) => [col, task[col]]))
  await insertRow('tasks', encode('tasks', { ...copy, due_date: due, status: 'todo' }), userId, client)
  await query('UPDATE tasks SET repeat_spawned = true WHERE id = $1', [task.id], client)
}

async function adjustStock(client, userId, productId, delta) {
  if (!productId || !delta) return
  await query('UPDATE products SET stock = COALESCE(stock, 0) + $1 WHERE id = $2 AND user_id = $3', [delta, productId, userId], client)
}

const rescheduled = (data, prev) =>
  prev && (('due_date' in data && data.due_date !== prev.due_date) || ('due_time' in data && data.due_time !== prev.due_time))

export const hooks = {
  tasks: {
    async beforeWrite(data, prev, client, userId) {
      if ('status' in data && data.status !== prev?.status) {
        data.completed_at = data.status === 'done' ? data.completed_at || (await userNow(userId, client)).stamp : null
      }
      if (rescheduled(data, prev)) data.reminded_at = null
    },
    afterCreate: spawnNextOccurrence,
    afterUpdate: (row, _prev, client, userId) => spawnNextOccurrence(row, client, userId),
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
