import clsx from 'clsx'
import { AtSign, MessageSquare, Phone } from 'lucide-react'
import { useList, type Partner } from '@/shared/api'
import { money, num, relDate, todayStr } from '@/shared/lib'
import { Card, StatusPicker, Table } from '@/shared/ui'
import { partnerStatuses, usePartnerTotals } from '@/entities/partner'

export function PartnersTable({
  partners,
  cur,
  onOpen,
  onStatus,
}: {
  partners: Partner[]
  cur: string
  onOpen: (id: number) => void
  onStatus: (id: number, status: string) => void
}) {
  const totals = usePartnerTotals()
  const interactions = useList('partner_interactions')
  const lastTouch = (id: number) => interactions.filter((i) => i.partner_id === id).reduce<string | null>((m, i) => (!m || i.date > m ? i.date : m), null)

  return (
    <Card>
      <Table>
        <thead>
          <tr>
            <th>Партнёр</th>
            <th>Статус</th>
            <th>Контакты</th>
            <th className="text-right!">Заявки</th>
            <th className="text-right!">Одобр.</th>
            <th className="text-right!">Оборот</th>
            <th className="text-right!">Прибыль</th>
            <th>Последний контакт</th>
            <th>Следующее действие</th>
          </tr>
        </thead>
        <tbody>
          {partners.map((p) => {
            const t = totals(p.id)
            return (
              <tr key={p.id} onClick={() => onOpen(p.id)} className="cursor-pointer hover:bg-hover">
                <td>
                  <div className="font-medium">{p.name}</div>
                  {p.company && <div className="text-[12.5px] text-fg-3">{p.company}</div>}
                </td>
                <td>
                  <StatusPicker value={p.status || 'new'} options={partnerStatuses} onChange={(v) => onStatus(p.id, v)} label="Этап" />
                </td>
                <td className="text-[12.5px] text-fg-2">
                  {p.phone && (
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <Phone size={11} />
                      {p.phone}
                    </div>
                  )}
                  {p.telegram && (
                    <div className="flex items-center gap-1">
                      <AtSign size={11} />
                      {p.telegram.replace(/^@/, '')}
                    </div>
                  )}
                </td>
                <td className="text-right tabular">{num(t.applications)}</td>
                <td className="text-right tabular">{num(t.approvals)}</td>
                <td className="text-right tabular">{money(t.turnover, cur)}</td>
                <td className="text-right tabular">{money(t.profit, cur)}</td>
                <td className="text-[12.5px] text-fg-2">
                  {lastTouch(p.id) ? (
                    <span className="flex items-center gap-1">
                      <MessageSquare size={11} />
                      {relDate(lastTouch(p.id))}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="max-w-56 text-[12.5px]">
                  {p.next_action ? (
                    <div className="truncate">
                      {p.next_action}
                      {p.next_action_date && (
                        <span className={clsx('ml-1', p.next_action_date < todayStr() ? 'text-bad' : 'text-fg-3')}>· {relDate(p.next_action_date)}</span>
                      )}
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </Table>
    </Card>
  )
}
