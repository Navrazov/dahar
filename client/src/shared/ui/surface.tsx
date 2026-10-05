import { useState, type HTMLAttributes, type ReactNode } from 'react'
import clsx from 'clsx'

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  const [actionsOpen, setActionsOpen] = useState(false)
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-[1.15] font-semibold tracking-[-0.025em]">{title}</h1>
        {subtitle && <div className="mt-1.5 max-w-2xl text-[14px] text-fg-2">{subtitle}</div>}
      </div>
      {actions && (
        <div className="w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActionsOpen((v) => !v)}
            aria-expanded={actionsOpen}
            className="inline-flex min-h-10 items-center rounded-lg border border-line bg-surface px-3 text-[13px] font-medium sm:hidden"
          >
            Действия
          </button>
          <div
            className={clsx(
              'flex-wrap items-center gap-2',
              actionsOpen ? 'mt-2 flex rounded-lg border border-line bg-surface p-3 sm:mt-0 sm:border-0 sm:bg-transparent sm:p-0' : 'hidden sm:flex',
            )}
          >
            {actions}
          </div>
        </div>
      )}
    </header>
  )
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('rounded-[10px] border border-line bg-surface', className)} {...rest}>
      {children}
    </div>
  )
}

export function CardHeader({ title, action, sub }: { title: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 pb-2.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <h3 className="truncate text-[14px] font-semibold tracking-[-0.01em]">{title}</h3>
        {sub != null && <span className="text-[13px] text-fg-3 tabular">{sub}</span>}
      </div>
      {action}
    </div>
  )
}

export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | null }) {
  return (
    <div className="rounded-[10px] border border-line bg-surface px-4 py-3">
      <div className="truncate text-[12.5px] text-fg-2">{label}</div>
      <div
        className={clsx(
          'mt-1 text-[22px] leading-tight font-semibold tracking-[-0.02em] tabular',
          tone === 'good' && 'text-good',
          tone === 'bad' && 'text-bad',
        )}
      >
        {value}
      </div>
      {sub != null && <div className="mt-0.5 truncate text-[12.5px] text-fg-3">{sub}</div>}
    </div>
  )
}

export function Empty({ title, hint, action, className }: { title: ReactNode; hint?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx('px-6 py-9 text-center', className)}>
      <div className="text-[14px] font-medium text-fg-2">{title}</div>
      {hint && <div className="mx-auto mt-1 max-w-sm text-[13px] text-fg-3">{hint}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={clsx('mb-3 text-[13px] font-medium text-fg-3', className)}>{children}</h2>
}
