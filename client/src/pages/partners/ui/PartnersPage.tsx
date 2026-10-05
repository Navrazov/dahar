import { useState } from 'react'
import clsx from 'clsx'
import { AtSign, CalendarClock, FileText, Mail, MapPin, MessageSquare, Pencil, Phone, Plus, Send } from 'lucide-react'
import { type Partner, type PartnerReport, type PartnerStatus, useList, useSave, useSettings } from '@/shared/api'
import { daysLeft, fmtDate, label, lastMonths, money, monthKey, num, pct, relDate, sum, todayStr } from '@/shared/lib'
import { Badge, Button, Card, CardHeader, Empty, Input, Modal, PageHeader, SearchInput, Segmented, Select, Stat, StatusPicker, Table } from '@/shared/ui'
import { BarsChart, Legend } from '@/shared/ui/charts'
import { interactionTypes, partnerStatuses, usePartnerTotals } from '@/entities/partner'
import { useEditor } from '@/features/edit-record'
import { TaskList } from '@/widgets/task-list'

function NextAction({ p }: { p: Partner }) {
  if (!p.next_action) return null
  const left = daysLeft(p.next_action_date)
  return (
    <div className={clsx('mt-2 flex items-center gap-1 text-[12px]', left != null && left < 0 ? 'text-bad' : left === 0 ? 'text-warn' : 'text-fg-3')}>
      <CalendarClock size={11} className="shrink-0" />
      <span className="truncate">
        {p.next_action}
        {p.next_action_date && ` · ${relDate(p.next_action_date)}`}
      </span>
    </div>
  )
}

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

function PartnerDrawer({ partner, onClose }: { partner: Partner; onClose: () => void }) {
  const edit = useEditor()
  const cur = useSettings().currency || '₽'
  const interactions = useList('partner_interactions').filter((i) => i.partner_id === partner.id).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  const reports = useList('partner_reports').filter((r) => r.partner_id === partner.id).sort((a, b) => b.date.localeCompare(a.date))
  const tasks = useList('tasks').filter((t) => t.partner_id === partner.id)
  const totals = usePartnerTotals()(partner.id)
  const saveInteraction = useSave('partner_interactions')
  const savePartner = useSave('partners')
  const [note, setNote] = useState('')
  const [type, setType] = useState('call')

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
    <Modal open onClose={onClose} width={760} title={<span className="flex items-center gap-2">{partner.name}{partner.company && <span className="font-normal text-fg-3">· {partner.company}</span>}</span>}>
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
          <Button icon={CalendarClock} onClick={() => edit('events', { partner_id: partner.id, project_id: partner.project_id, title: `Встреча: ${partner.name}` })}>
            Встреча
          </Button>
        </div>

        {contacts.length > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13.5px]">
            {contacts.map((c) => (
              <span key={c.v} className="flex items-center gap-1.5 text-fg-2">
                <c.icon size={13} className="text-fg-3" />
                {c.href ? <a href={c.href} target="_blank" rel="noreferrer" className="hover:text-accent-text hover:underline">{c.v}</a> : c.v}
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
            <Select value={type} onChange={(v) => setType(v || 'call')} options={interactionTypes.map((t) => ({ value: t.value, label: t.label }))} className="w-full shrink-0 sm:w-36" />
            <Input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Что обсудили? Enter — сохранить" />
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

export function PartnersPage() {
  const partners = useList('partners')
  const reports = useList('partner_reports')
  const interactions = useList('partner_interactions')
  const cur = useSettings().currency || '₽'
  const edit = useEditor()
  const save = useSave('partners')
  const totals = usePartnerTotals()
  const [view, setView] = useState<'board' | 'table'>('board')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [dragId, setDragId] = useState<number | null>(null)
  const open = partners.find((p) => p.id === openId)

  const shown = partners.filter((p) => !q || [p.name, p.company, p.city, p.phone, p.telegram].join(' ').toLowerCase().includes(q.toLowerCase()))
  const month = todayStr().slice(0, 7)
  const monthReports = reports.filter((r) => monthKey(r.date) === month)
  const apps = sum(reports.map((r) => r.applications))
  const approvals = sum(reports.map((r) => r.approvals))
  const due = partners.filter((p) => p.next_action && p.next_action_date && p.next_action_date <= todayStr())
  const lastTouch = (id: number) => interactions.filter((i) => i.partner_id === id).reduce<string | null>((m, i) => (!m || i.date > m ? i.date : m), null)
  const months = lastMonths(12).map((m) => {
    const rs = reports.filter((r) => monthKey(r.date) === m.key)
    return { month: m.label, applications: sum(rs.map((r) => r.applications)), approvals: sum(rs.map((r) => r.approvals)) }
  })
  const setStatus = (id: number, status: string) => save.mutate({ id, status: status as PartnerStatus })

  return (
    <>
      <PageHeader
        title="Партнёры"
        subtitle="CRM партнёрской сети: воронка, отчёты, взаимодействия и следующие шаги"
        actions={
          <>
            <Segmented value={view} onChange={setView} options={[{ value: 'board', label: 'Воронка' }, { value: 'table', label: 'Таблица' }]} />
            <Button icon={FileText} onClick={() => edit('partner_reports')}>
              Отчёт
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => edit('partners')}>
              Партнёр
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Всего партнёров" value={partners.length} sub={`${partners.filter((p) => p.status === 'active').length} активных`} />
        <Stat label="Заявки" value={num(apps)} sub={`за месяц: ${num(sum(monthReports.map((r) => r.applications)))}`} />
        <Stat label="Одобрения" value={num(approvals)} sub={apps ? `конверсия ${pct(approvals / apps)}` : undefined} />
        <Stat label="Оборот" value={money(sum(reports.map((r) => r.turnover)), cur)} sub={`за месяц: ${money(sum(monthReports.map((r) => r.turnover)), cur)}`} />
        <Stat label="Прибыль" value={money(sum(reports.map((r) => r.profit)), cur)} sub={`за месяц: ${money(sum(monthReports.map((r) => r.profit)), cur)}`} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title="Заявки и одобрения по месяцам" action={<Legend items={[{ label: 'Заявки', color: 'var(--s1)' }, { label: 'Одобрения', color: 'var(--s3)' }]} />} />
          <div className="px-2 pb-3">
            {reports.length ? (
              <BarsChart data={months} x="month" bars={[{ key: 'applications', name: 'Заявки', color: 'var(--s1)' }, { key: 'approvals', name: 'Одобрения', color: 'var(--s3)' }]} fmt={(v) => num(v)} height={200} />
            ) : (
              <Empty title="Нет отчётов" hint="Добавляйте отчёты партнёров по периодам — здесь появится динамика" />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Нужно сделать" sub={due.length || undefined} />
          {!due.length ? (
            <Empty title="Срочных действий нет" />
          ) : (
            <div className="divide-y divide-line">
              {due.map((p) => (
                <button key={p.id} type="button" onClick={() => setOpenId(p.id)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover">
                  <span className="shrink-0 text-[13.5px] font-medium">{p.name}</span>
                  <span className="truncate text-[13.5px] text-fg-2">{p.next_action}</span>
                  <span className={clsx('ml-auto shrink-0 text-[12.5px]', p.next_action_date! < todayStr() ? 'text-bad' : 'text-warn')}>{relDate(p.next_action_date)}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mb-3">
        <SearchInput value={q} onChange={setQ} placeholder="Имя, компания, город…" />
      </div>

      {!partners.length ? (
        <Card>
          <Empty title="База партнёров пуста" hint="Добавьте первого партнёра и ведите его по воронке от «Новый» до «Активный партнёр»" action={<Button variant="primary" icon={Plus} onClick={() => edit('partners')}>Добавить партнёра</Button>} />
        </Card>
      ) : view === 'board' ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex gap-3">
            {partnerStatuses.map((s) => {
              const col = shown.filter((p) => (p.status || 'new') === s.value)
              return (
                <div
                  key={s.value}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragId) setStatus(dragId, s.value)
                    setDragId(null)
                  }}
                  className="flex w-64 shrink-0 flex-col rounded-[10px] border border-line bg-surface-2/50"
                >
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <Badge tone={s.tone}>{s.label}</Badge>
                    <span className="text-[12.5px] text-fg-3">{col.length}</span>
                  </div>
                  <div className="flex min-h-24 flex-col gap-2 px-2 pb-2">
                    {col.map((p) => {
                      const t = totals(p.id)
                      return (
                        <div
                          key={p.id}
                          draggable
                          onDragStart={() => setDragId(p.id)}
                          onDragEnd={() => setDragId(null)}
                          onClick={() => setOpenId(p.id)}
                          className={clsx('cursor-pointer rounded-[9px] border border-line bg-surface p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-shadow hover:shadow-md', dragId === p.id && 'opacity-50')}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-[13.5px] font-medium">{p.name}</div>
                              {p.company && <div className="truncate text-[12.5px] text-fg-3">{p.company}</div>}
                            </div>
                            <StatusPicker value={p.status || 'new'} options={partnerStatuses} onChange={(v) => setStatus(p.id, v)} label="Этап" compact />
                          </div>
                          {(t.applications > 0 || t.turnover > 0) && (
                            <div className="mt-2 flex gap-3 text-[12px] text-fg-2 tabular">
                              {t.applications > 0 && <span>{t.applications} заяв.</span>}
                              {t.approvals > 0 && <span>{t.approvals} одобр.</span>}
                              {t.turnover > 0 && <span>{money(t.turnover, cur)}</span>}
                            </div>
                          )}
                          <NextAction p={p} />
                        </div>
                      )
                    })}
                    <button type="button" onClick={() => edit('partners', { status: s.value })} className="flex h-7 items-center justify-center gap-1 rounded-[7px] text-[12.5px] text-fg-3 hover:bg-hover hover:text-fg">
                      <Plus size={12} /> Добавить
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
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
              {shown.map((p) => {
                const t = totals(p.id)
                return (
                  <tr key={p.id} onClick={() => setOpenId(p.id)} className="cursor-pointer hover:bg-hover">
                    <td>
                      <div className="font-medium">{p.name}</div>
                      {p.company && <div className="text-[12.5px] text-fg-3">{p.company}</div>}
                    </td>
                    <td>
                      <StatusPicker value={p.status || 'new'} options={partnerStatuses} onChange={(v) => setStatus(p.id, v)} label="Этап" />
                    </td>
                    <td className="text-[12.5px] text-fg-2">
                      {p.phone && <div className="flex items-center gap-1 whitespace-nowrap"><Phone size={11} />{p.phone}</div>}
                      {p.telegram && <div className="flex items-center gap-1"><AtSign size={11} />{p.telegram.replace(/^@/, '')}</div>}
                    </td>
                    <td className="text-right tabular">{num(t.applications)}</td>
                    <td className="text-right tabular">{num(t.approvals)}</td>
                    <td className="text-right tabular">{money(t.turnover, cur)}</td>
                    <td className="text-right tabular">{money(t.profit, cur)}</td>
                    <td className="text-[12.5px] text-fg-2">
                      {lastTouch(p.id) ? (
                        <span className="flex items-center gap-1"><MessageSquare size={11} />{relDate(lastTouch(p.id))}</span>
                      ) : '—'}
                    </td>
                    <td className="max-w-56 text-[12.5px]">
                      {p.next_action ? (
                        <div className="truncate">
                          {p.next_action}
                          {p.next_action_date && <span className={clsx('ml-1', p.next_action_date < todayStr() ? 'text-bad' : 'text-fg-3')}>· {relDate(p.next_action_date)}</span>}
                        </div>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </Card>
      )}

      {open && <PartnerDrawer partner={open} onClose={() => setOpenId(null)} />}
    </>
  )
}
