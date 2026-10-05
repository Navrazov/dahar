import { startAction } from '../history/operation.ts'
import { query, tx, type Db } from '../../db/pool.ts'

export async function setHabitLog(userId: number, habitId: number, date: string, status: unknown, client?: Db): Promise<void> {
  if (!client)
    return tx(async (c) => {
      await query('SELECT pg_advisory_xact_lock($1,$2)', [7262005, userId], c)
      await startAction(userId, 'Отметка привычки', c)
      return setHabitLog(userId, habitId, date, status, c)
    })
  if (!status) {
    await query('DELETE FROM habit_logs WHERE habit_id = $1 AND date = $2 AND user_id = $3', [habitId, date, userId], client)
    return
  }
  await query(
    `INSERT INTO habit_logs (user_id, habit_id, date, status) VALUES ($1, $2, $3, $4)
     ON CONFLICT (habit_id, date) DO UPDATE SET status = excluded.status`,
    [userId, habitId, date, status === 'slip' ? 'slip' : 'done'],
    client,
  )
}

export async function habitLogStatus(habitId: number, date: string): Promise<string | null> {
  const { rows } = await query('SELECT status FROM habit_logs WHERE habit_id = $1 AND date = $2', [habitId, date])
  return rows[0]?.status ?? null
}
