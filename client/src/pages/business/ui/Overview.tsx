import { byId, useList, useSettings } from '@/shared/api'
import { lastMonths, money, monthKey, pct, sum, todayStr } from '@/shared/lib'
import { Badge, Card, CardHeader, Empty, Stat } from '@/shared/ui'
import { BarsChart, Legend, RankBars } from '@/shared/ui/charts'
import { businessMonth, saleProfit } from '@/entities/business'

export function Overview() {
  const cur = useSettings().currency || '₽'
  const products = useList('products')
  const sales = useList('sales')
  const expenses = useList('biz_expenses')
  const productMap = byId(products)
  const month = todayStr().slice(0, 7)
  const now = businessMonth(sales, expenses, month)
  const prevKey = lastMonths(2)[0].key
  const prev = businessMonth(sales, expenses, prevKey)
  const months = lastMonths(12).map((m) => {
    const b = businessMonth(sales, expenses, m.key)
    return { month: m.label, revenue: b.revenue, net: b.net }
  })
  const stockValue = sum(products.map((p) => (p.purchase_price || 0) * (p.stock || 0)))
  const stockRetail = sum(products.map((p) => (p.sale_price || 0) * (p.stock || 0)))
  const low = products.filter((p) => (p.stock ?? 0) <= 1).sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0))

  const topMap = new Map<string, number>()
  for (const s of sales) {
    const k = s.product_id ? productMap.get(s.product_id)?.name || 'Удалённый товар' : 'Без товара'
    topMap.set(k, (topMap.get(k) || 0) + saleProfit(s))
  }
  const top = [...topMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
  const expMap = new Map<string, number>()
  for (const e of expenses.filter((e) => monthKey(e.date) === month))
    expMap.set(e.category || 'Без категории', (expMap.get(e.category || 'Без категории') || 0) + (e.amount || 0))
  const delta = (a: number, b: number) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / Math.abs(b)) * 100)}% к прошлому месяцу` : 'прошлый месяц: 0')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Выручка за месяц" value={money(now.revenue, cur)} sub={delta(now.revenue, prev.revenue)} />
        <Stat label="Валовая прибыль" value={money(now.gross, cur)} sub={now.revenue ? `маржа ${pct(now.gross / now.revenue)}` : '—'} />
        <Stat label="Расходы бизнеса" value={money(now.expenses, cur)} />
        <Stat label="Чистая прибыль" value={money(now.net, cur)} tone={now.net >= 0 ? 'good' : 'bad'} sub={delta(now.net, prev.net)} />
        <Stat label="Склад" value={money(stockValue, cur)} sub={`по закупке · в рознице ${money(stockRetail, cur)}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader
            title="Выручка и чистая прибыль по месяцам"
            action={
              <Legend
                items={[
                  { label: 'Выручка', color: 'var(--s1)' },
                  { label: 'Чистая прибыль', color: 'var(--s3)' },
                ]}
              />
            }
          />
          <div className="px-2 pb-3">
            <BarsChart
              data={months}
              x="month"
              bars={[
                { key: 'revenue', name: 'Выручка', color: 'var(--s1)' },
                { key: 'net', name: 'Чистая прибыль', color: 'var(--s3)' },
              ]}
              fmt={(v) => money(v, cur)}
              signed
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Заканчивается на складе" sub={low.length || undefined} />
          {!low.length ? (
            <Empty title="Всё в наличии" />
          ) : (
            <div className="divide-y divide-line">
              {low.slice(0, 8).map((p) => (
                <div key={p.id} className="flex items-center justify-between px-4 py-2 text-[13.5px]">
                  <span className="truncate">
                    {p.brand && <span className="text-fg-3">{p.brand} · </span>}
                    {p.name}
                  </span>
                  <Badge tone={(p.stock ?? 0) <= 0 ? 'bad' : 'warn'}>{p.stock ?? 0} шт</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Самые прибыльные товары" sub="за всё время" />
          <div className="px-4 pb-4">{top.length ? <RankBars items={top} fmt={(v) => money(v, cur)} /> : <Empty title="Нет продаж" />}</div>
        </Card>
        <Card>
          <CardHeader title="Расходы по категориям" sub="этот месяц" />
          <div className="px-4 pb-4">
            {expMap.size ? (
              <RankBars
                items={[...expMap.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)}
                fmt={(v) => money(v, cur)}
                color="var(--s2)"
              />
            ) : (
              <Empty title="Расходов в этом месяце нет" />
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
