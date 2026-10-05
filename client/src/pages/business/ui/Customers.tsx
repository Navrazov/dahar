import { useState } from 'react'
import { useList, useSettings } from '@/shared/api'
import { money, relDate, sum } from '@/shared/lib'
import { Card, Empty, SearchInput, Table } from '@/shared/ui'
import { useEditor } from '@/features/edit-record'

export function Customers() {
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
