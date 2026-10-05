import { useState } from 'react'
import clsx from 'clsx'
import { byId, useList, useSettings } from '@/shared/api'
import { fmtDate, money, monthKey, sum } from '@/shared/lib'
import { Card, Empty, FilterSelect, Table } from '@/shared/ui'
import { saleProfit } from '@/entities/business'
import { useEditor } from '@/features/edit-record'

export function Sales() {
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
        <FilterSelect
          value={month}
          onChange={setMonth}
          all="За всё время"
          options={months.map((m) => ({ value: m, label: fmtDate(m + '-01', 'LLLL yyyy') }))}
        />
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
                  <td className="font-medium">{s.product_id ? (products.get(s.product_id)?.name ?? '—') : '—'}</td>
                  <td className="text-fg-2">{s.customer_id ? (customers.get(s.customer_id)?.name ?? '—') : '—'}</td>
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
