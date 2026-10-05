import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Card } from './base'

export type Metric = { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | null }

export function MetricStrip({ items, className }: { items: Metric[]; className?: string }) {
  return (
    <Card className={clsx('grid grid-cols-2 overflow-hidden sm:grid-cols-3 xl:grid-flow-col xl:auto-cols-fr xl:grid-cols-none', className)}>
      {items.map((m) => (
        <div key={m.label} className="-mt-px -ml-px border-t border-l border-line px-4 py-3.5">
          <div className="truncate text-[12.5px] text-fg-2">{m.label}</div>
          <div className={clsx('mt-1 text-[22px] leading-tight font-semibold tracking-[-0.02em] tabular', m.tone === 'good' && 'text-good', m.tone === 'bad' && 'text-bad')}>{m.value}</div>
          {m.sub != null && <div className="mt-0.5 truncate text-[12px] text-fg-3">{m.sub}</div>}
        </div>
      ))}
    </Card>
  )
}
