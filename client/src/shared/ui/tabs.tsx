import type { ReactNode } from 'react'
import clsx from 'clsx'

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-[8px] bg-surface-2 p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'h-[30px] rounded-[6px] px-3 text-[13px] font-medium transition-colors',
            value === o.value ? 'bg-surface text-fg shadow-[0_1px_2px_rgb(0_0_0/0.07)]' : 'text-fg-2 hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="mb-6 flex gap-5 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={clsx(
            '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 pb-2.5 text-[14px] font-medium transition-colors',
            value === t.value ? 'border-fg text-fg' : 'border-transparent text-fg-3 hover:text-fg',
          )}
        >
          {t.label}
          {t.count != null && t.count > 0 && <span className="text-[12px] text-fg-3 tabular">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}
