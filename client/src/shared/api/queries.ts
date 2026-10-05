import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { collectionKey, patchLists } from './collections'
import { api } from './endpoints'
import type { HabitLog, Settings } from './types'

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
    onMutate: async ({ key, value }) => {
      await qc.cancelQueries({ queryKey: SETTINGS_KEY })
      const prev = qc.getQueryData<Settings>(SETTINGS_KEY)
      if (prev) qc.setQueryData(SETTINGS_KEY, { ...prev, [key]: value })
      return () => qc.setQueryData(SETTINGS_KEY, prev)
    },
    onError: (_e, _v, rollback) => rollback?.(),
    onSettled: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
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
    onMutate: (v) =>
      patchLists<HabitLog>(qc, collectionKey('habit_logs'), (rows) => {
        const rest = rows.filter((r) => !(r.habit_id === v.habit_id && r.date === v.date))
        return v.status ? [...rest, { id: -Date.now(), habit_id: v.habit_id, date: v.date, status: v.status } as HabitLog] : rest
      }),
    onError: (_e, _v, rollback) => rollback?.(),
    onSettled: () => qc.invalidateQueries({ queryKey: collectionKey('habit_logs') }),
  })
}
