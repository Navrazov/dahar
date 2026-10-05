import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { request, type Goal } from '@/shared/api'

export function useGoalValue() {
  const { data } = useQuery({ queryKey: ['goal-values'], queryFn: () => request<Record<number, number>>('/api/goal-values') })
  return useCallback((g: Goal) => (g.metric ? (data?.[g.id] ?? 0) : (g.current_value ?? 0)), [data])
}
export function useGoalProgress() {
  const value = useGoalValue()
  return useCallback((g: Goal) => (g.status === 'done' ? 1 : !g.target_value ? 0 : Math.max(0, Math.min(1, value(g) / g.target_value))), [value])
}
