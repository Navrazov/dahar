import { useList } from '@/shared/api'
import type { SelectOption } from '@/shared/ui'

export function useProjectOptions(): SelectOption[] {
  return useList('projects')
    .filter((p) => p.status !== 'archived')
    .map((p) => ({ value: String(p.id), label: p.name, dot: p.color }))
}
