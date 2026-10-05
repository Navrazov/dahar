import { useState } from 'react'
import { Plus, ShoppingBag } from 'lucide-react'
import { useList, useSettings } from '@/shared/api'
import { money, pct, sum } from '@/shared/lib'
import { Badge, Button, Card, Empty, SearchInput, Table } from '@/shared/ui'
import { useEditor } from '@/features/edit-record'

export function Products() {
  const cur = useSettings().currency || '₽'
  const products = useList('products')
  const sales = useList('sales')
  const edit = useEditor()
  const [q, setQ] = useState('')
  const shown = products
    .filter((p) => !q || [p.name, p.brand].join(' ').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.brand || '').localeCompare(b.brand || '') || a.name.localeCompare(b.name))
  const sold = (id: number) => sum(sales.filter((s) => s.product_id === id).map((s) => s.quantity || 0))
  return (
    <>
      <div className="mb-3">
        <SearchInput value={q} onChange={setQ} placeholder="Название или бренд…" />
      </div>
      <Card>
        {!shown.length ? (
          <Empty
            title="Товаров нет"
            hint="Добавьте товары с закупочной ценой и ценой продажи — прибыль по продажам будет считаться сама"
            action={
              <Button variant="primary" icon={Plus} onClick={() => edit('products')}>
                Добавить товар
              </Button>
            }
          />
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
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={ShoppingBag}
                        onClick={(e) => {
                          e.stopPropagation()
                          edit('sales', { product_id: p.id, amount: p.sale_price, cost: p.purchase_price })
                        }}
                      >
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
