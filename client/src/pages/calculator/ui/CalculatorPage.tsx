import { useMemo, useState } from 'react'
import { useSettings } from '@/shared/api'
import { money, num } from '@/shared/lib'
import { Card, CardHeader, FieldLabel, NumberInput, PageHeader, Segmented, Select, Stat, Table } from '@/shared/ui'
import { Legend, StackedArea } from '@/shared/ui/charts'

interface Params {
  initial: number
  monthly: number
  years: number
  rate: number
  growth: number
  inflation: number
  compounding: 12 | 4 | 1
}

interface Point {
  month: number
  year: number
  contributed: number
  balance: number
}

function simulate(p: Params): Point[] {
  const months = Math.round(p.years * 12)
  const monthlyRate = p.rate / 100 / 12
  let balance = p.initial
  let contributed = p.initial
  let pending = 0
  let monthly = p.monthly
  const out: Point[] = [{ month: 0, year: 0, contributed, balance }]
  for (let m = 1; m <= months; m++) {
    if (m > 1 && (m - 1) % 12 === 0) monthly *= 1 + p.growth / 100
    balance += monthly
    contributed += monthly
    const interest = balance * monthlyRate
    if (p.compounding === 12) balance += interest
    else {
      pending += interest
      if (m % (12 / p.compounding) === 0) {
        balance += pending
        pending = 0
      }
    }
    out.push({ month: m, year: m / 12, contributed, balance: balance + (m === months ? pending : 0) })
  }
  return out
}

export function CalculatorPage() {
  const cur = useSettings().currency || '₽'
  const [p, setP] = useState<Params>({ initial: 100000, monthly: 20000, years: 10, rate: 12, growth: 0, inflation: 0, compounding: 12 })
  const [granularity, setGranularity] = useState<'year' | 'month'>('year')
  const limits: Partial<Record<keyof Params, [number, number]>> = { years: [0, 100], rate: [-100, 1000], growth: [-100, 1000], inflation: [-100, 1000] }
  const set = (k: keyof Params, v: number | null) => {
    const [lo, hi] = limits[k] ?? [0, 1e12]
    setP((prev) => ({ ...prev, [k]: Math.min(hi, Math.max(lo, v ?? 0)) }))
  }

  const points = useMemo(() => simulate(p), [p])
  const last = points[points.length - 1]
  const profit = last.balance - last.contributed
  const real = p.inflation ? last.balance / Math.pow(1 + p.inflation / 100, p.years) : null

  const yearly = points.filter((x) => x.month % 12 === 0 || x.month === points.length - 1)
  const chart = (granularity === 'year' ? yearly : points).map((x) => ({ t: x.month, contributed: Math.round(x.contributed), growth: Math.round(x.balance - x.contributed) }))
  const tLabel = (m: number) => (granularity === 'year' || m % 12 === 0 ? `${num(m / 12, 1)} г.` : `${Math.floor(m / 12)} г. ${m % 12} мес.`)

  const fields: { k: keyof Params; label: string; suffix: string; negative?: boolean }[] = [
    { k: 'initial', label: 'Начальный капитал', suffix: cur },
    { k: 'monthly', label: 'Пополнение в месяц', suffix: cur },
    { k: 'years', label: 'Срок', suffix: 'лет' },
    { k: 'rate', label: 'Доходность', suffix: '% год.', negative: true },
    { k: 'growth', label: 'Рост пополнений', suffix: '% в год' },
    { k: 'inflation', label: 'Инфляция (для реальной стоимости)', suffix: '%' },
  ]

  return (
    <>
      <PageHeader title="Инвестиционный калькулятор" subtitle="Сложный процент с регулярными пополнениями" />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit space-y-3.5 p-4">
          {fields.map((f) => (
            <FieldLabel key={f.k} label={f.label}>
              <NumberInput value={p[f.k]} onChange={(v) => set(f.k, v)} suffix={f.suffix} allowNegative={!!f.negative} className="[&_input]:pr-16" />
            </FieldLabel>
          ))}
          <FieldLabel label="Капитализация">
            <Select
              value={String(p.compounding)}
              onChange={(v) => v && setP((prev) => ({ ...prev, compounding: Number(v) as Params['compounding'] }))}
              options={[{ value: '12', label: 'Ежемесячно' }, { value: '4', label: 'Ежеквартально' }, { value: '1', label: 'Ежегодно' }]}
            />
          </FieldLabel>
        </Card>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat label="Итоговый капитал" value={money(last.balance, cur)} sub={real ? `≈ ${money(real, cur)} в сегодняшних деньгах` : `через ${p.years} ${p.years === 1 ? 'год' : 'лет'}`} />
            <Stat label="Внесено" value={money(last.contributed, cur)} />
            <Stat label="Доход от инвестиций" value={money(profit, cur)} tone="good" sub={last.contributed ? `+${num((profit / last.contributed) * 100, 1)}% к вложенному` : undefined} />
            <Stat label="Доля дохода в капитале" value={last.balance ? `${num((profit / last.balance) * 100, 0)}%` : '—'} />
          </div>
          <Card>
            <CardHeader
              title="Рост капитала"
              action={
                <div className="flex items-center gap-3">
                  <Legend items={[{ label: 'Внесено', color: 'var(--s1)' }, { label: 'Доход', color: 'var(--s3)' }]} />
                  <Segmented value={granularity} onChange={setGranularity} options={[{ value: 'year', label: 'Годы' }, { value: 'month', label: 'Месяцы' }]} />
                </div>
              }
            />
            <div className="px-2 pb-3">
              <StackedArea
                data={chart}
                x="t"
                xFmt={tLabel}
                areas={[
                  { key: 'contributed', name: 'Внесено', color: 'var(--s1)' },
                  { key: 'growth', name: 'Доход', color: 'var(--s3)' },
                ]}
                fmt={(v) => money(v, cur)}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="По годам" />
            <Table className="max-h-96 overflow-y-auto">
              <thead>
                <tr>
                  <th>Год</th>
                  <th className="text-right!">Внесено всего</th>
                  <th className="text-right!">Доход всего</th>
                  <th className="text-right!">Доход за год</th>
                  <th className="text-right!">Капитал</th>
                </tr>
              </thead>
              <tbody>
                {yearly.slice(1).map((x, i) => {
                  const prev = yearly[i]
                  const yearGain = x.balance - prev.balance - (x.contributed - prev.contributed)
                  return (
                    <tr key={x.month}>
                      <td>{num(x.year, 1)}</td>
                      <td className="text-right tabular">{money(x.contributed, cur)}</td>
                      <td className="text-right tabular text-good">{money(x.balance - x.contributed, cur)}</td>
                      <td className="text-right tabular text-fg-2">{money(yearGain, cur)}</td>
                      <td className="text-right font-medium tabular">{money(x.balance, cur)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </Card>
        </div>
      </div>
    </>
  )
}
