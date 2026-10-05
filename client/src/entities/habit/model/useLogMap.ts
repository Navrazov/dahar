import { useMemo } from 'react'
import type { HabitLog } from '@/shared/api'

export function useLogMap(logs: HabitLog[]) {
  return useMemo(() => new Map(logs.map((l) => [`${l.habit_id}:${l.date}`, l.status])), [logs])
}
