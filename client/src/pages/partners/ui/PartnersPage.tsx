import { useState } from 'react'
import clsx from 'clsx'
import { FileText, Plus } from 'lucide-react'
import { type PartnerStatus, useList, useSave, useSettings } from '@/shared/api'
import { lastMonths, money, monthKey, num, pct, relDate, sum, todayStr } from '@/shared/lib'
import { Button, Card, CardHeader, Empty, PageHeader, SearchInput, Segmented, Stat } from '@/shared/ui'
import { BarsChart, Legend } from '@/shared/ui/charts'
import { useEditor } from '@/features/edit-record'
import { PartnerDrawer } from './PartnerDrawer'
import { PartnersBoard } from './PartnersBoard'
import { PartnersTable } from './PartnersTable'

export function PartnersPage() {
  const partners = useList('partners')
  const reports = useList('partner_reports')
  const cur = useSettings().currency || '₽'
  const edit = useEditor()
  const save = useSave('partners')
  const [view, setView] = useState<'board' | 'table'>('board')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const open = partners.find((p) => p.id === openId)

  const shown = partners.filter((p) => !q || [p.name, p.company, p.city, p.phone, p.telegram].join(' ').toLowerCase().includes(q.toLowerCase()))
  const month = todayStr().slice(0, 7)
  const monthReports = reports.filter((r) => monthKey(r.date) === month)
  const apps = sum(reports.map((r) => r.applications))
  const approvals = sum(reports.map((r) => r.approvals))
  const due = partners.filter((p) => p.next_action && p.next_action_date && p.next_action_date <= todayStr())
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
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'board', label: 'Воронка' },
                { value: 'table', label: 'Таблица' },
              ]}
            />
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
        <Stat
          label="Оборот"
          value={money(sum(reports.map((r) => r.turnover)), cur)}
          sub={`за месяц: ${money(sum(monthReports.map((r) => r.turnover)), cur)}`}
        />
        <Stat label="Прибыль" value={money(sum(reports.map((r) => r.profit)), cur)} sub={`за месяц: ${money(sum(monthReports.map((r) => r.profit)), cur)}`} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader
            title="Заявки и одобрения по месяцам"
            action={
              <Legend
                items={[
                  { label: 'Заявки', color: 'var(--s1)' },
                  { label: 'Одобрения', color: 'var(--s3)' },
                ]}
              />
            }
          />
          <div className="px-2 pb-3">
            {reports.length ? (
              <BarsChart
                data={months}
                x="month"
                bars={[
                  { key: 'applications', name: 'Заявки', color: 'var(--s1)' },
                  { key: 'approvals', name: 'Одобрения', color: 'var(--s3)' },
                ]}
                fmt={(v) => num(v)}
                height={200}
              />
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
                  <span className={clsx('ml-auto shrink-0 text-[12.5px]', p.next_action_date! < todayStr() ? 'text-bad' : 'text-warn')}>
                    {relDate(p.next_action_date)}
                  </span>
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
          <Empty
            title="База партнёров пуста"
            hint="Добавьте первого партнёра и ведите его по воронке от «Новый» до «Активный партнёр»"
            action={
              <Button variant="primary" icon={Plus} onClick={() => edit('partners')}>
                Добавить партнёра
              </Button>
            }
          />
        </Card>
      ) : view === 'board' ? (
        <PartnersBoard partners={shown} cur={cur} onOpen={setOpenId} onStatus={setStatus} />
      ) : (
        <PartnersTable partners={shown} cur={cur} onOpen={setOpenId} onStatus={setStatus} />
      )}

      {open && <PartnerDrawer partner={open} onClose={() => setOpenId(null)} />}
    </>
  )
}
