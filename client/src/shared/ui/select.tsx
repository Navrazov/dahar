import { useState } from 'react'
import clsx from 'clsx'
import { Command } from 'cmdk'
import { Check, ChevronDown, Search } from 'lucide-react'
import { PopoverPanel } from './overlay'
import { controlCls } from './fields'

export type SelectOption = { value: string; label: string; dot?: string | null; hint?: string }

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Выберите…',
  clearable,
  clearLabel = 'Не выбрано',
  searchable,
  className,
  disabled,
  autoFocus,
}: {
  value: string | null | undefined
  onChange: (v: string | null) => void
  options: SelectOption[]
  placeholder?: string
  clearable?: boolean
  clearLabel?: string
  searchable?: boolean
  className?: string
  disabled?: boolean
  autoFocus?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === (value ?? ''))
  const showSearch = searchable ?? options.length > 8
  const key = (o: SelectOption) => `${o.label}\u0000${o.value}`
  const pick = (v: string | null) => {
    onChange(v)
    setOpen(false)
  }

  return (
    <PopoverPanel
      open={open}
      onOpenChange={setOpen}
      matchWidth
      className="min-w-52"
      trigger={
        <button
          type="button"
          disabled={disabled}
          data-autofocus={autoFocus ? '' : undefined}
          className={clsx(controlCls, 'flex h-9 items-center gap-2 px-3 text-left', open && 'border-accent ring-[3px] ring-accent/15', className)}
        >
          {selected?.dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: selected.dot }} />}
          <span className={clsx('min-w-0 flex-1 truncate', !selected && 'text-fg-3')}>{selected ? selected.label : placeholder}</span>
          <ChevronDown size={14} className={clsx('shrink-0 text-fg-3 transition-transform duration-200', open && 'rotate-180')} />
        </button>
      }
    >
      <Command
        defaultValue={selected ? key(selected) : undefined}
        loop
        className="flex max-h-[min(340px,var(--radix-popover-content-available-height))] flex-col"
      >
        {showSearch && (
          <div className="flex items-center gap-2 border-b border-line px-2.5">
            <Search size={14} className="shrink-0 text-fg-3" />
            <Command.Input autoFocus placeholder="Поиск…" className="h-9 w-full bg-transparent text-[13px] outline-none placeholder:text-fg-3" />
          </div>
        )}
        <Command.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
          <Command.Empty className="px-2 py-6 text-center text-xs text-fg-3">Ничего не найдено</Command.Empty>
          {clearable && (
            <Command.Item value={`\u0001${clearLabel}`} onSelect={() => pick(null)} className={itemCls}>
              <span className="flex-1 text-fg-3">{clearLabel}</span>
              {!selected && <Check size={14} className="text-accent" />}
            </Command.Item>
          )}
          {options.map((o) => (
            <Command.Item key={o.value} value={key(o)} keywords={[o.label]} onSelect={() => pick(o.value)} className={itemCls}>
              {o.dot !== undefined && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: o.dot || 'var(--text-3)' }} />}
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.hint && <span className="shrink-0 text-xs text-fg-3">{o.hint}</span>}
              {selected?.value === o.value && <Check size={14} className="shrink-0 text-accent" />}
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </PopoverPanel>
  )
}

const itemCls =
  'flex h-8 cursor-pointer items-center gap-2 rounded-[6px] px-2 text-[13.5px] outline-none select-none transition-colors duration-100 data-[selected=true]:bg-hover'
