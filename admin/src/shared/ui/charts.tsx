import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { num, shortDay } from '../lib/format'

const axis = { stroke: 'var(--axis)', fontSize: 11, tickLine: false, axisLine: false } as const

function Tip({ active, payload, label, name }: { active?: boolean; payload?: { value: number }[]; label?: string; name: string }) {
  if (!active || !payload?.length || !label) return null
  return (
    <div className="rounded-[8px] border border-line bg-surface px-3 py-2 text-[12.5px] shadow-lg">
      <div className="mb-0.5 font-medium">{shortDay(label)}</div>
      <div className="flex gap-3 text-fg-2">
        {name}
        <span className="ml-auto font-medium text-fg tabular">{num(payload[0].value)}</span>
      </div>
    </div>
  )
}

type Props = { data: { day: string; value: number }[]; name: string; color?: string; height?: number }

export function DailyArea({ data, name, color = 'var(--s1)', height = 200 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="day" {...axis} tickFormatter={shortDay} minTickGap={32} />
        <YAxis {...axis} width={36} allowDecimals={false} />
        <Tooltip content={<Tip name={name} />} cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }} />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.12} dot={false} isAnimationActive={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--chart-surface)' }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function DailyBars({ data, name, color = 'var(--s1)', height = 200 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="day" {...axis} tickFormatter={shortDay} minTickGap={32} />
        <YAxis {...axis} width={36} allowDecimals={false} />
        <Tooltip content={<Tip name={name} />} cursor={{ fill: 'var(--surface-hover)' }} />
        <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} maxBarSize={14} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function RankBars({ items, total, color = 'var(--s1)' }: { items: { label: string; value: number }[]; total?: number; color?: string }) {
  const base = total || Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="space-y-3 px-4 pb-4">
      {items.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 text-fg-2 tabular">
              {num(r.value)}
              {total ? <span className="text-fg-3"> · {Math.round((r.value / total) * 100)}%</span> : null}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full" style={{ width: `${(r.value / base) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ActivityGrid({ days }: { days: { day: string; value: number }[] }) {
  const pad = (new Date(`${days[0]?.day}T12:00`).getDay() + 6) % 7
  const cells = [...Array.from({ length: pad }, () => null), ...days]
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-[3px] overflow-x-auto" aria-label="Дни активности">
      {cells.map((d, i) =>
        d ? (
          <div key={d.day} title={`${shortDay(d.day)}: ${d.value ? 'заходил' : 'не заходил'}`} className="h-[11px] w-[11px] rounded-[3px]" style={{ background: d.value ? 'var(--s3)' : 'var(--surface-2)' }} />
        ) : (
          <div key={`pad-${i}`} className="h-[11px] w-[11px]" />
        ),
      )}
    </div>
  )
}
