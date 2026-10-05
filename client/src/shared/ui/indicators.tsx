import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Check } from 'lucide-react'
import type { Tone } from '../lib/options'

const tones: Record<Tone, string> = {
  gray: 'bg-surface-2 text-fg-2',
  accent: 'bg-accent-soft text-accent-text',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
}

export function Badge({ tone = 'gray', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: string }) {
  return (
    <span className={clsx('inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-[12px] font-medium whitespace-nowrap', tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  )
}

export function Progress({ value, color, className, size = 'md' }: { value: number; color?: string; className?: string; size?: 'sm' | 'md' }) {
  const v = Math.max(0, Math.min(1, value || 0))
  return (
    <div
      className={clsx('w-full overflow-hidden rounded-full bg-surface-2', size === 'sm' ? 'h-1' : 'h-1.5', className)}
      role="progressbar"
      aria-valuenow={Math.round(v * 100)}
    >
      <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${v * 100}%`, background: color || 'var(--accent)' }} />
    </div>
  )
}

export function Dot({ color, className }: { color?: string | null; className?: string }) {
  return <span className={clsx('inline-block h-2 w-2 shrink-0 rounded-full', className)} style={{ background: color || 'var(--text-3)' }} />
}

export function Checkbox({ checked, onChange, color, label }: { checked: boolean; onChange: () => void; color?: string; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }}
      className={clsx(
        'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-[background-color,border-color,transform] duration-200 active:scale-90',
        checked ? 'border-transparent text-white animate-[check-in_260ms_var(--ease-out)]' : 'border-line-strong hover:border-fg-3',
      )}
      style={checked ? { background: color || 'var(--accent)' } : undefined}
    >
      {checked && <Check size={11} strokeWidth={3} />}
    </button>
  )
}
