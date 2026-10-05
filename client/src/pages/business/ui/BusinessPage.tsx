import { useState } from 'react'
import clsx from 'clsx'
import { Clapperboard, Plus, ShoppingBag } from 'lucide-react'
import { byId, type ContentStatus, useList, useSave, useSettings } from '@/shared/api'
import { fmtDate, lastMonths, money, monthKey, num, pct, relDate, sum, todayStr } from '@/shared/lib'
import { Badge, Button, Card, CardHeader, Empty, FilterSelect, PageHeader, SearchInput, Stat, StatusPicker, Table, Tabs } from '@/shared/ui'
import { BarsChart, Legend, RankBars } from '@/shared/ui/charts'
import { businessMonth, contentStatuses, saleProfit } from '@/entities/business'
import { useModule } from '@/entities/module'
import { useEditor } from '@/features/edit-record'
import { ModuleSettings } from '@/features/module-settings'

type Tab = 'overview' | 'products' | 'sales' | 'customers' | 'expenses' | 'content'

export function BusinessPage() {
  const { label: title } = useModule('business')
  const [tab, setTab] = useState<Tab>('overview')
  const edit = useEditor()
  const products = useList('products')
  const sales = useList('sales')
  const customers = useList('customers')
  const expenses = useList('biz_expenses')
  const content = useList('content')

  const addAction: Record<Tab, { label: string; table: 'sales' | 'products' | 'customers' | 'biz_expenses' | 'content' }> = {
    overview: { label: 'Продажа', table: 'sales' },
    sales: { label: 'Продажа', table: 'sales' },
    products: { label: 'Товар', table: 'products' },
    customers: { label: 'Клиент', table: 'customers' },
    expenses: { label: 'Расход', table: 'biz_expenses' },
    content: { label: 'Контент', table: 'content' },
  }

  return (
    <>
      <PageHeader
        title={title}
        subtitle="Товары, склад, продажи, клиенты, расходы и контент-план"
        actions={
          <>
            <ModuleSettings
              title="Настройки бизнеса"
              items={[
                { key: 'business_project_id', label: 'Проект бизнеса', type: 'project', hint: 'Новые товары, продажи, расходы и контент автоматически привязываются к нему' },
                { key: 'currency', label: 'Валюта', type: 'currency', hint: 'Общая валюта для бизнеса и личных финансов' },
              ]}
            />
            <Button variant="primary" icon={Plus} onClick={() => edit(addAction[tab].table)}>
              {addAction[tab].label}
            </Button>
          </>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Обзор' },
          { value: 'products', label: 'Товары', count: products.length },
          { value: 'sales', label: 'Продажи', count: sales.length },
          { value: 'customers', label: 'Клиенты', count: customers.length },
          { value: 'expenses', label: 'Расходы', count: expenses.length },
          { value: 'content', label: 'Контент', count: content.filter((c) => c.status !== 'published').length },
        ]}
      />
      {tab === 'overview' && <Overview />}
      {tab === 'products' && <Products />}
      {tab === 'sales' && <Sales />}
      {tab === 'customers' && <Customers />}
      {tab === 'expenses' && <Expenses />}
      {tab === 'content' && <ContentBoard />}
    </>
  )
}

function Overview() {
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
  const top = [...topMap.entries()].map(([label, value]) => ({ label, value })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value)
  const expMap = new Map<string, number>()
  for (const e of expenses.filter((e) => monthKey(e.date) === month)) expMap.set(e.category || 'Без категории', (expMap.get(e.category || 'Без категории') || 0) + (e.amount || 0))
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
          <CardHeader title="Выручка и чистая прибыль по месяцам" action={<Legend items={[{ label: 'Выручка', color: 'var(--s1)' }, { label: 'Чистая прибыль', color: 'var(--s3)' }]} />} />
          <div className="px-2 pb-3">
            <BarsChart data={months} x="month" bars={[{ key: 'revenue', name: 'Выручка', color: 'var(--s1)' }, { key: 'net', name: 'Чистая прибыль', color: 'var(--s3)' }]} fmt={(v) => money(v, cur)} signed />
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
            {expMap.size ? <RankBars items={[...expMap.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)} fmt={(v) => money(v, cur)} color="var(--s2)" /> : <Empty title="Расходов в этом месяце нет" />}
          </div>
        </Card>
      </div>
    </div>
  )
}

function Products() {
  const cur = useSettings().currency || '₽'
  const products = useList('products')
  const sales = useList('sales')
  const edit = useEditor()
  const [q, setQ] = useState('')
  const shown = products.filter((p) => !q || [p.name, p.brand].join(' ').toLowerCase().includes(q.toLowerCase())).sort((a, b) => (a.brand || '').localeCompare(b.brand || '') || a.name.localeCompare(b.name))
  const sold = (id: number) => sum(sales.filter((s) => s.product_id === id).map((s) => s.quantity || 0))
  return (
    <>
      <div className="mb-3">
        <SearchInput value={q} onChange={setQ} placeholder="Название или бренд…" />
      </div>
      <Card>
        {!shown.length ? (
          <Empty title="Товаров нет" hint="Добавьте товары с закупочной ценой и ценой продажи — прибыль по продажам будет считаться сама" action={<Button variant="primary" icon={Plus} onClick={() => edit('products')}>Добавить товар</Button>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Товар</th>
                <th>Бренд</th>
                <th>Объём</th>
                <th className="text-right!">Закупка</th>
                <th className="text-right!">Продажа</th>
                <th className="text-right!">Маржа</th>
                <th className="text-right!">Остаток</th>
                <th className="text-right!">Продано</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const margin = (p.sale_price || 0) - (p.purchase_price || 0)
                return (
                  <tr key={p.id} onClick={() => edit('products', p)} className="cursor-pointer hover:bg-hover">
                    <td className="font-medium">{p.name}</td>
                    <td className="text-fg-2">{p.brand || '—'}</td>
                    <td className="text-fg-2">{p.volume || '—'}</td>
                    <td className="text-right tabular">{money(p.purchase_price, cur)}</td>
                    <td className="text-right tabular">{money(p.sale_price, cur)}</td>
                    <td className="text-right tabular">
                      {money(margin, cur)} {p.sale_price ? <span className="text-fg-3">· {pct(margin / p.sale_price)}</span> : null}
                    </td>
                    <td className="text-right">
                      <Badge tone={(p.stock ?? 0) <= 0 ? 'bad' : (p.stock ?? 0) <= 1 ? 'warn' : 'gray'}>{p.stock ?? 0} шт</Badge>
                    </td>
                    <td className="text-right text-fg-2 tabular">{sold(p.id)}</td>
                    <td className="text-right">
                      <Button size="sm" variant="ghost" icon={ShoppingBag} onClick={(e) => { e.stopPropagation(); edit('sales', { product_id: p.id, amount: p.sale_price, cost: p.purchase_price }) }}>
                        Продать
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}

function Sales() {
  const cur = useSettings().currency || '₽'
  const sales = useList('sales')
  const products = byId(useList('products'))
  const customers = byId(useList('customers'))
  const edit = useEditor()
  const [month, setMonth] = useState('')
  const months = [...new Set(sales.map((s) => monthKey(s.date)))].sort().reverse()
  const shown = sales.filter((s) => !month || monthKey(s.date) === month).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterSelect value={month} onChange={setMonth} all="За всё время" options={months.map((m) => ({ value: m, label: fmtDate(m + '-01', 'LLLL yyyy') }))} />
        <span className="text-[12.5px] text-fg-3">
          {shown.length} продаж · выручка {money(sum(shown.map((s) => s.amount)), cur)} · прибыль {money(sum(shown.map(saleProfit)), cur)}
        </span>
      </div>
      <Card>
        {!shown.length ? (
          <Empty title="Продаж нет" hint="При добавлении продажи остаток товара на складе уменьшится автоматически" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Товар</th>
                <th>Клиент</th>
                <th className="text-right!">Кол-во</th>
                <th className="text-right!">Сумма</th>
                <th className="text-right!">Себестоимость</th>
                <th className="text-right!">Прибыль</th>
                <th>Оплата</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id} onClick={() => edit('sales', s)} className="cursor-pointer hover:bg-hover">
                  <td className="whitespace-nowrap text-fg-2">{fmtDate(s.date, 'd MMM yy')}</td>
                  <td className="font-medium">{s.product_id ? products.get(s.product_id)?.name ?? '—' : '—'}</td>
                  <td className="text-fg-2">{s.customer_id ? customers.get(s.customer_id)?.name ?? '—' : '—'}</td>
                  <td className="text-right tabular">{s.quantity ?? 1}</td>
                  <td className="text-right tabular">{money(s.amount, cur)}</td>
                  <td className="text-right text-fg-2 tabular">{money(s.cost, cur)}</td>
                  <td className={clsx('text-right font-medium tabular', saleProfit(s) >= 0 ? 'text-good' : 'text-bad')}>{money(saleProfit(s), cur)}</td>
                  <td className="text-fg-2">{s.payment_method || '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}

function Customers() {
  const cur = useSettings().currency || '₽'
  const customers = useList('customers')
  const sales = useList('sales')
  const edit = useEditor()
  const [q, setQ] = useState('')
  const rows = customers
    .filter((c) => !q || [c.name, c.phone, c.instagram, c.city].join(' ').toLowerCase().includes(q.toLowerCase()))
    .map((c) => {
      const mine = sales.filter((s) => s.customer_id === c.id)
      return { c, count: mine.length, total: sum(mine.map((s) => s.amount)), last: mine.reduce<string | null>((m, s) => (!m || s.date > m ? s.date : m), null) }
    })
    .sort((a, b) => b.total - a.total)
  return (
    <>
      <div className="mb-3">
        <SearchInput value={q} onChange={setQ} />
      </div>
      <Card>
        {!rows.length ? (
          <Empty title="Клиентов нет" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Клиент</th>
                <th>Телефон</th>
                <th>Instagram</th>
                <th>Город</th>
                <th className="text-right!">Покупок</th>
                <th className="text-right!">Сумма</th>
                <th>Последняя</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, count, total, last }) => (
                <tr key={c.id} onClick={() => edit('customers', c)} className="cursor-pointer hover:bg-hover">
                  <td className="font-medium">{c.name}</td>
                  <td className="text-fg-2">{c.phone || '—'}</td>
                  <td className="text-fg-2">{c.instagram || '—'}</td>
                  <td className="text-fg-2">{c.city || '—'}</td>
                  <td className="text-right tabular">{count}</td>
                  <td className="text-right tabular">{money(total, cur)}</td>
                  <td className="text-fg-2">{last ? relDate(last) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}

function Expenses() {
  const cur = useSettings().currency || '₽'
  const expenses = useList('biz_expenses')
  const edit = useEditor()
  const shown = [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  return (
    <Card>
      {!shown.length ? (
        <Empty title="Расходов нет" hint="Реклама, доставка, упаковка, пробники — всё, что уменьшает чистую прибыль" />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Категория</th>
              <th>Комментарий</th>
              <th className="text-right!">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.id} onClick={() => edit('biz_expenses', e)} className="cursor-pointer hover:bg-hover">
                <td className="whitespace-nowrap text-fg-2">{fmtDate(e.date, 'd MMM yy')}</td>
                <td>{e.category || '—'}</td>
                <td className="text-fg-2">{e.note || '—'}</td>
                <td className="text-right font-medium tabular">{money(e.amount, cur)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  )
}

function ContentBoard() {
  const content = useList('content')
  const save = useSave('content')
  const edit = useEditor()
  const [dragId, setDragId] = useState<number | null>(null)
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex gap-3">
        {contentStatuses.map((s) => {
          const col = content
            .filter((c) => (c.status || 'idea') === s.value)
            .sort((a, b) => (a.publish_date || '9').localeCompare(b.publish_date || '9'))
          return (
            <div
              key={s.value}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId) {
                  const patch: { id: number; status: ContentStatus; publish_date?: string } = { id: dragId, status: s.value as ContentStatus }
                  const item = content.find((c) => c.id === dragId)
                  if (s.value === 'published' && !item?.publish_date) patch.publish_date = todayStr()
                  save.mutate(patch)
                }
                setDragId(null)
              }}
              className="flex w-60 shrink-0 flex-col rounded-[10px] border border-line bg-surface-2/50"
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <Badge tone={s.tone}>{s.label}</Badge>
                <span className="text-[12.5px] text-fg-3">{col.length}</span>
              </div>
              <div className="flex min-h-24 flex-col gap-2 px-2 pb-2">
                {col.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => edit('content', c)}
                    className={clsx('cursor-pointer rounded-[9px] border border-line bg-surface p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)] hover:shadow-md', dragId === c.id && 'opacity-50')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 text-[13.5px] font-medium">{c.title}</div>
                      <StatusPicker value={c.status || 'idea'} options={contentStatuses} label="Этап" compact onChange={(v) => save.mutate({ id: c.id, status: v as ContentStatus, ...(v === 'published' && !c.publish_date ? { publish_date: todayStr() } : {}) })} />
                    </div>
                    {c.idea && <div className="mt-1 line-clamp-2 text-[12.5px] text-fg-3">{c.idea}</div>}
                    <div className="mt-2 flex items-center gap-2 text-[12px] text-fg-3">
                      {c.platform && <span className="flex items-center gap-1"><Clapperboard size={11} />{c.platform}</span>}
                      {c.publish_date && <span>{relDate(c.publish_date)}</span>}
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => edit('content', { status: s.value })} className="flex h-7 items-center justify-center gap-1 rounded-[7px] text-[12.5px] text-fg-3 hover:bg-hover hover:text-fg">
                  <Plus size={12} /> Добавить
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[12.5px] text-fg-3">Перетаскивайте карточки между этапами. При переносе в «Опубликовано» дата публикации ставится автоматически. Всего единиц: {num(content.length)}</p>
    </div>
  )
}
