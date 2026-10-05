import { Select } from '@/shared/ui'
import { useProjectOptions } from '../model/useProjectOptions'

export function ProjectFilter({ value, onChange, withNone }: { value: string; onChange: (v: string) => void; withNone?: boolean }) {
  const options = useProjectOptions()
  return (
    <Select
      value={value || null}
      onChange={(v) => onChange(v ?? '')}
      options={withNone ? [{ value: 'none', label: 'Без проекта', dot: null }, ...options] : options}
      clearable
      clearLabel="Все проекты"
      placeholder="Все проекты"
      className="w-full sm:w-52"
    />
  )
}
