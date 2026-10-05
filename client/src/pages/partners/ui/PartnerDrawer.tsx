import { useState } from 'react'
import { CalendarClock, Mail, MapPin, Pencil, Phone, Plus, Send } from 'lucide-react'
import { type Interaction, type Partner, type PartnerReport, type PartnerStatus, useList, useSave, useSettings } from '@/shared/api'
import { fmtDate, label, money, num, pct, todayStr } from '@/shared/lib'
import { Button, Input, Modal, Select, Table } from '@/shared/ui'
import { interactionTypes, partnerStatuses, usePartnerTotals } from '@/entities/partner'
import { useEditor } from '@/features/edit-record'
import { TaskList } from '@/widgets/task-list'

function ReportsList({ reports, cur }: { reports: PartnerReport[]; cur: string }) {
  const edit = useEditor()
  if (!reports.length) return <div className="py-4 text-center text-[12.5px] text-fg-3">Отчётов пока нет — добавьте результаты за период</div>
  return (
    <Table>
      <thead>
        <tr>
          <th>Период</th>
          <th className="text-right!">Заявки</th>
          <th className="text-right!">Одобрения</th>
          <th className="text-right!">Оборот</th>
          <th className="text-right!">Прибыль</th>
        </tr>
      </thead>
      <tbody>
        {reports.map((r) => (
          <tr key={r.id} onClick={() => edit('partner_reports', r)} className="cursor-pointer hover:bg-hover">
            <td className="whitespace-nowrap text-fg-2">{fmtDate(r.date, 'd MMM yyyy')}</td>
            <td className="text-right tabular">{num(r.applications)}</td>
            <td className="text-right tabular">{num(r.approvals)}</td>
            <td className="text-right tabular">{money(r.turnover, cur)}</td>
            <td className="text-right tabular">{money(r.profit, cur)}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}

export function PartnerDrawer({ partner, onClose }: { partner: Partner; onClose: () => void }) {
  const edit = useEditor()
  const cur = useSettings().currency || '₽'
  const interactions = useList('partner_interactions')
    .filter((i) => i.partner_id === partner.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  const reports = useList('partner_reports')
    .filter((r) => r.partner_id === partner.id)
    .sort((a, b) => b.date.localeCompare(a.date))
  const tasks = useList('tasks').filter((t) => t.partner_id === partner.id)
  const totals = usePartnerTotals()(partner.id)
  const saveInteraction = useSave('partner_interactions')
  const savePartner = useSave('partners')
  const [note, setNote] = useState('')
  const [type, setType] = useState<NonNullable<Interaction['type']>>('call')

  const add = () => {
    if (!note.trim()) return
    saveInteraction.mutate({ partner_id: partner.id, date: todayStr(), type, note: note.trim() })
    setNote('')
  }

  const contacts = [
    partner.phone && { icon: Phone, v: partner.phone, href: `tel:${partner.phone.replace(/[^\d+]/g, '')}` },
    partner.telegram && { icon: Send, v: partner.telegram, href: `https://t.me/${partner.telegram.replace(/^@/, '')}` },
    partner.email && { icon: Mail, v: partner.email, href: `mailto:${partner.email}` },
    partner.city && { icon: MapPin, v: partner.city },
  ].filter(Boolean) as { icon: typeof Phone; v: string; href?: string }[]

  return (
    <Modal
      open
      onClose={onClose}
      width={760}
      title={
        <span className="flex items-center gap-2">
          {partner.name}
          {partner.company && <span className="font-normal text-fg-3">· {partner.company}</span>}
        </span>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={partner.status || 'new'}
            onChange={(v) => v && savePartner.mutate({ id: partner.id, status: v as PartnerStatus })}
            options={partnerStatuses.map((s) => ({ value: s.value, label: s.label }))}
            className="w-full sm:w-56"
          />
          <Button icon={Pencil} onClick={() => edit('partners', partner)}>
            Изменить
          </Button>
          <Button icon={Plus} onClick={() => edit('tasks', { partner_id: partner.id, project_id: partner.project_id, title: partner.next_action || '' })}>
            Задача
          </Button>
          <Button
            icon={CalendarClock}
            onClick={() => edit('events', { partner_id: partner.id, project_id: partner.project_id, title: `Встреча: ${partner.name}` })}
          >
            Встреча
          </Button>
        </div>

        {contacts.length > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13.5px]">
            {contacts.map((c) => (
              <span key={c.v} className="flex items-center gap-1.5 text-fg-2">
                <c.icon size={13} className="text-fg-3" />
                {c.href ? (
                  <a href={c.href} target="_blank" rel="noreferrer" className="hover:text-accent-text hover:underline">
                    {c.v}
                  </a>
                ) : (
                  c.v
                )}
              </span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { l: 'Заявки', v: num(totals.applications) },
            { l: 'Одобрения', v: `${num(totals.approvals)}${totals.applications ? ` · ${pct(totals.approvals / totals.applications)}` : ''}` },
            { l: 'Оборот', v: money(totals.turnover, cur) },
            { l: 'Прибыль', v: money(totals.profit, cur) },
          ].map((x) => (
            <div key={x.l} className="rounded-[9px] bg-surface-2 px-3 py-2">
              <div className="text-[12px] text-fg-3">{x.l}</div>
              <div className="text-[14px] font-semibold tabular">{x.v}</div>
            </div>
          ))}
        </div>

        {(partner.next_action || partner.comment) && (
          <div className="space-y-2 rounded-[9px] border border-line p-3 text-[13.5px]">
            {partner.next_action && (
              <div>
                <span className="text-fg-3">Следующее действие: </span>
                {partner.next_action}
                {partner.next_action_date && <span className="text-fg-3"> · {fmtDate(partner.next_action_date, 'd MMM yyyy')}</span>}
              </div>
            )}
            {partner.comment && <div className="whitespace-pre-wrap text-fg-2">{partner.comment}</div>}
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13.5px] font-semibold">Отчёты по периодам</h3>
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => edit('partner_reports', { partner_id: partner.id })}>
              Отчёт
            </Button>
          </div>
          <div className="overflow-hidden rounded-[9px] border border-line">
            <ReportsList reports={reports} cur={cur} />
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-[13.5px] font-semibold">Задачи</h3>
          <div className="overflow-hidden rounded-[9px] border border-line">
            <TaskList tasks={tasks} empty="Задач по партнёру нет" />
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-[13.5px] font-semibold">История взаимодействий</h3>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <Select
              value={type}
              onChange={(v) => setType((v || 'call') as NonNullable<Interaction['type']>)}
              options={interactionTypes.map((t) => ({ value: t.value, label: t.label }))}
              className="w-full shrink-0 sm:w-36"
            />
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="Что обсудили? Enter — сохранить"
            />
            <Button variant="primary" onClick={add}>
              Добавить
            </Button>
          </div>
          {!interactions.length ? (
            <div className="py-4 text-center text-[12.5px] text-fg-3">Пока нет записей</div>
          ) : (
            <ol className="relative space-y-3 border-l border-line pl-4">
              {interactions.map((i) => (
                <li key={i.id} className="relative cursor-pointer" onClick={() => edit('partner_interactions', i)}>
                  <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent" />
                  <div className="text-[12px] text-fg-3">
                    {fmtDate(i.date, 'd MMM yyyy')} · {label(interactionTypes, i.type)}
                  </div>
                  <div className="text-[13.5px] whitespace-pre-wrap">{i.note}</div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Modal>
  )
}
