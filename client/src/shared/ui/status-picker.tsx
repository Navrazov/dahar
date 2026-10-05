import { ChevronDown } from 'lucide-react'
import type { Option } from '../lib/options'
import { Select, type SelectOption } from './select'
import { Badge } from './indicators'
import { DropdownMenu } from './overlay'

export function FilterSelect({
  value,
  onChange,
  options,
  all,
  className = 'w-full sm:w-48',
}: {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  all: string
  className?: string
}) {
  return (
    <Select value={value || null} onChange={(v) => onChange(v ?? '')} options={options} clearable clearLabel={all} placeholder={all} className={className} />
  )
}

export function StatusPicker({
  value,
  options,
  onChange,
  label = 'Статус',
  compact,
}: {
  value: string | null | undefined
  options: Option[]
  onChange: (v: string) => void
  label?: string
  compact?: boolean
}) {
  const current = options.find((o) => o.value === value) ?? options[0]
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <DropdownMenu
        align="end"
        trigger={
          compact ? (
            <button
              type="button"
              aria-label={`${label}: ${current.label}. Изменить`}
              title={`${label}: изменить`}
              className="-m-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-fg-3 outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ChevronDown size={14} />
            </button>
          ) : (
            <button
              type="button"
              aria-label={`${label}: ${current.label}`}
              className="inline-flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Badge tone={current.tone}>
                {current.label}
                <ChevronDown size={11} className="-mr-0.5 opacity-60" />
              </Badge>
            </button>
          )
        }
        items={options.map((o) => ({ label: o.label, onSelect: () => o.value !== value && onChange(o.value) }))}
      />
    </span>
  )
}
