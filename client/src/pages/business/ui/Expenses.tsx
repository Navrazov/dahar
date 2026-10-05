import { useList, useSettings } from '@/shared/api'
import { fmtDate, money } from '@/shared/lib'
import { Card, Empty, Table } from '@/shared/ui'
import { useEditor } from '@/features/edit-record'

export function Expenses() {
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
