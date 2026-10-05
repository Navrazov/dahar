import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { collectionKey } from './collections'
import { api } from './endpoints'
import type { Settings } from './types'

const NO_SETTINGS: Settings = Object.freeze({}) as Settings

export const SETTINGS_KEY = ['settings'] as const

export function useSettings(): Settings {
  const { data } = useQuery({ queryKey: SETTINGS_KEY, queryFn: api.settings })
  return data ?? NO_SETTINGS
}

export function useSettingsLoaded(): boolean {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: api.settings }).isSuccess
}

export function useSetSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: keyof Settings; value: unknown }) => api.setSetting(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  })
}

export function useFinanceSummary(month: string) {
  const { data } = useQuery({ queryKey: [...collectionKey('transactions'), 'summary', month], queryFn: () => api.financeSummary(month) })
  return data
}

export function useHabitLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { habit_id: number; date: string; status: 'done' | 'slip' | null }) => api.habitLog(v.habit_id, v.date, v.status),
    onSuccess: () => qc.invalidateQueries({ queryKey: collectionKey('habit_logs') }),
  })
}
