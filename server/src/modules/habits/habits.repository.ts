import { query } from '../../db/pool.ts'

export async function setHabitLog(userId: number, habitId: number, date: string, status: unknown) {
  if (!status) {
    await query('DELETE FROM habit_logs WHERE habit_id = $1 AND date = $2 AND user_id = $3', [habitId, date, userId])
    return
  }
  await query(
    `INSERT INTO habit_logs (user_id, habit_id, date, status) VALUES ($1, $2, $3, $4)
     ON CONFLICT (habit_id, date) DO UPDATE SET status = excluded.status`,
    [userId, habitId, date, status === 'slip' ? 'slip' : 'done'],
  )
}

export async function habitLogStatus(habitId: number, date: string): Promise<string | null> {
  const { rows } = await query('SELECT status FROM habit_logs WHERE habit_id = $1 AND date = $2', [habitId, date])
  return rows[0]?.status ?? null
}
