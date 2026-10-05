import { Area, AreaChart, Bar, BarChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts'
import type { ReactNode } from 'react'
import { compact } from '../lib/number'

export const series = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)']

const axis = { stroke: 'var(--axis)', fontSize: 11, tickLine: false, axisLine: false } as const

type Fmt = (v: number) => string

function ChartTooltip({ active, payload, label, fmt, labelFmt }: { active?: boolean; payload?: any[]; label?: any; fmt: Fmt; labelFmt?: (l: any) => ReactNode }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-[8px] border border-line bg-surface px-3 py-2 text-[12.5px] shadow-lg">
      <div className="mb-1 font-medium text-fg">{labelFmt ? labelFmt(label) : label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-fg-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-medium text-fg tabular">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-fg-2">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

export function TrendChart({ data, x, y, name, fmt, height = 220, color = 'var(--s1)', baseline }: { data: any[]; x: string; y: string; name: string; fmt: Fmt; height?: number; color?: string; baseline?: number }) {
  const id = `g-${y}-${name.length}`
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey={x} {...axis} minTickGap={24} />
        <YAxis {...axis} width={64} tickFormatter={compact} domain={['auto', 'auto']} />
        {baseline != null && <ReferenceLine y={baseline} stroke="var(--axis)" strokeDasharray="3 3" />}
        <Tooltip content={<ChartTooltip fmt={fmt} />} cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }} />
        <Area type="monotone" dataKey={y} name={name} stroke={color} strokeWidth={2} fill={`url(#${id})`} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--chart-surface)' }} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function BarsChart({ data, x, bars, fmt, height = 240, stacked, signed }: { data: any[]; x: string; bars: { key: string; name: string; color: string }[]; fmt: Fmt; height?: number; stacked?: boolean; signed?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="24%">
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey={x} {...axis} />
        <YAxis {...axis} width={64} tickFormatter={compact} />
        {signed && <ReferenceLine y={0} stroke="var(--axis)" />}
        <Tooltip content={<ChartTooltip fmt={fmt} />} cursor={{ fill: 'var(--surface-hover)' }} />
        {bars.map((b, i) => (
          <Bar
            key={b.key}
            dataKey={b.key}
            name={b.name}
            fill={b.color}
            stackId={stacked ? 's' : undefined}
            radius={stacked ? (i === bars.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]}
            maxBarSize={28}
            isAnimationActive={false}
            stroke={stacked ? 'var(--chart-surface)' : undefined}
            strokeWidth={stacked ? 1 : 0}
          >
            {signed && bars.length === 1 && data.map((d, j) => <Cell key={j} fill={d[b.key] < 0 ? 'var(--s8)' : b.color} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function StackedArea({ data, x, areas, fmt, height = 300, xFmt }: { data: any[]; x: string; areas: { key: string; name: string; color: string }[]; fmt: Fmt; height?: number; xFmt?: (v: any) => string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey={x} {...axis} tickFormatter={xFmt} minTickGap={16} />
        <YAxis {...axis} width={64} tickFormatter={compact} />
        <Tooltip content={<ChartTooltip fmt={fmt} labelFmt={xFmt} />} cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }} />
        {areas.map((a) => (
          <Area key={a.key} type="monotone" dataKey={a.key} name={a.name} stackId="1" stroke={a.color} strokeWidth={2} fill={a.color} fillOpacity={0.22} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--chart-surface)' }} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function RankBars({ items, fmt, color = 'var(--s1)', max = 8 }: { items: { label: string; value: number; color?: string }[]; fmt: Fmt; color?: string; max?: number }) {
  const top = items.slice(0, max)
  const rest = items.slice(max)
  const rows = rest.length ? [...top, { label: 'Другое', value: rest.reduce((a, b) => a + b.value, 0), color: 'var(--text-3)' }] : top
  const peak = Math.max(...rows.map((r) => r.value), 1)
  const total = rows.reduce((a, b) => a + b.value, 0) || 1
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} title={`${r.label}: ${fmt(r.value)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[12.5px]">
            <span className="truncate text-fg">{r.label}</span>
            <span className="shrink-0 text-fg-2 tabular">
              {fmt(r.value)} <span className="text-fg-3">· {Math.round((r.value / total) * 100)}%</span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full" style={{ width: `${(r.value / peak) * 100}%`, background: r.color || color }} />
          </div>
        </div>
      ))}
    </div>
  )
}
