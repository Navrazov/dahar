import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Plus } from 'lucide-react'
import { byId, type CollectionName, type ModuleKey, useList, useListWhere, useLoaded, useSettings } from '@/shared/api'
import { daysLeft, fmtDate, label, money, num, pct, signedMoney, sum, todayStr, tone } from '@/shared/lib'
import { Badge, Button, Card, CardHeader, Dot, DropdownMenu, Empty, PageHeader, Progress, Stat, Tabs } from '@/shared/ui'
import { contentStatuses, saleProfit } from '@/entities/business'
import { txnKinds } from '@/entities/finance'
import { useGoalProgress } from '@/entities/goal'
import { isEnabled } from '@/entities/module'
import { partnerStatuses, type PartnerTotals, usePartnerTotals } from '@/entities/partner'
import { projectProgress, projectStatuses } from '@/entities/project'
import { netPnl, topicStatuses, tradingStats } from '@/entities/trade'
import { useEditor } from '@/features/edit-record'
import { EventList } from '@/widgets/event-list'
import { GoalList } from '@/widgets/goal-list'
import { TaskList } from '@/widgets/task-list'

type Row = Record<string, any>

const linked: { table: CollectionName; label: string; add: string; row: (r: Row, ctx: Ctx) => { title: ReactNode; sub?: ReactNode; right?: ReactNode } }[] = [
  {
    table: 'trades',
    label: 'Сделки',
    add: 'Сделку',
    row: (t, c) => ({
      title: `${t.instrument || '—'} · ${t.direction === 'short' ? 'Short' : 'Long'}`,
      sub: `${fmtDate(t.date, 'd MMM yyyy')}${t.strategy ? ' · ' + t.strategy : ''}`,
      right:
        t.pnl == null ? (
          <Badge>Открыта</Badge>
        ) : (
          <span className={netPnl(t as any) >= 0 ? 'text-good' : 'text-bad'}>{signedMoney(netPnl(t as any), c.tcur, 2)}</span>
        ),
    }),
  },
  {
    table: 'trading_topics',
    label: 'Обучение',
    add: 'Тему',
    row: (t) => ({ title: t.title, sub: t.category, right: <Badge tone={tone(topicStatuses, t.status)}>{label(topicStatuses, t.status)}</Badge> }),
  },
  {
    table: 'sales',
    label: 'Продажи',
    add: 'Продажу',
    row: (s, c) => ({
      title: c.products.get(s.product_id)?.name ?? 'Продажа',
      sub: `${fmtDate(s.date, 'd MMM yyyy')}${s.customer_id ? ' · ' + (c.customers.get(s.customer_id)?.name ?? '') : ''}`,
      right: (
        <span>
          {money(s.amount, c.cur)} <span className="text-fg-3">· прибыль {money(saleProfit(s as any), c.cur)}</span>
        </span>
      ),
    }),
  },
  {
    table: 'biz_expenses',
    label: 'Расходы',
    add: 'Расход',
    row: (e, c) => ({ title: e.category || 'Расход', sub: `${fmtDate(e.date, 'd MMM yyyy')}${e.note ? ' · ' + e.note : ''}`, right: money(e.amount, c.cur) }),
  },
  {
    table: 'content',
    label: 'Контент',
    add: 'Контент',
    row: (x) => ({
      title: x.title,
      sub: [x.platform, x.publish_date && fmtDate(x.publish_date)].filter(Boolean).join(' · '),
      right: <Badge tone={tone(contentStatuses, x.status)}>{label(contentStatuses, x.status)}</Badge>,
    }),
  },
  {
    table: 'products',
    label: 'Товары',
    add: 'Товар',
    row: (p, c) => ({ title: p.name, sub: [p.brand, p.volume].filter(Boolean).join(' · '), right: `${p.stock ?? 0} шт · ${money(p.sale_price, c.cur)}` }),
  },
  {
    table: 'partners',
    label: 'Партнёры',
    add: 'Партнёра',
    row: (p, c) => ({
      title: p.name,
      sub: p.company,
      right: (
        <span className="flex items-center gap-2">
          <span className="text-fg-3">{money(c.partnerTotals(p.id).turnover, c.cur)}</span>
          <Badge tone={tone(partnerStatuses, p.status)}>{label(partnerStatuses, p.status)}</Badge>
        </span>
      ),
    }),
  },
  { table: 'habits', label: 'Привычки', add: 'Привычку', row: (h) => ({ title: h.name, sub: h.kind === 'quit' ? 'Избавиться' : 'Сформировать' }) },
  {
    table: 'transactions',
    label: 'Финансы',
    add: 'Операцию',
    row: (t, c) => ({
      title: t.category || label(txnKinds, t.kind),
      sub: `${fmtDate(t.date, 'd MMM yyyy')}${t.note ? ' · ' + t.note : ''}`,
      right: (
        <span className={t.kind === 'income' ? 'text-good' : t.kind === 'expense' ? 'text-bad' : ''}>
          {t.kind === 'expense' ? '−' : t.kind === 'income' ? '+' : ''}
          {money(t.amount, c.cur)}
        </span>
      ),
    }),
  },
]

type Ctx = { cur: string; tcur: string; products: Map<number, any>; customers: Map<number, any>; partnerTotals: (id: number) => PartnerTotals }

const moduleOf: Partial<Record<CollectionName, ModuleKey>> = {
  trades: 'trading',
  trading_topics: 'trading',
  sales: 'business',
  biz_expenses: 'business',
  content: 'business',
  products: 'business',
  partners: 'partners',
  habits: 'habits',
  transactions: 'finance',
}

function AddLinked({ projectId }: { projectId: number }) {
  const edit = useEditor()
  const settings = useSettings()
  const items: { table: CollectionName; label: string }[] = [
    { table: 'tasks', label: 'Задачу' },
    { table: 'events', label: 'Событие' },
    { table: 'goals', label: 'Цель' },
    ...linked.filter((l) => !moduleOf[l.table] || isEnabled(settings, moduleOf[l.table]!)).map((l) => ({ table: l.table, label: l.add })),
  ]
  return (
    <DropdownMenu
      align="end"
      trigger={
        <Button variant="primary" icon={Plus}>
          Добавить в проект
        </Button>
      }
      items={items.map((i) => ({ label: i.label, onSelect: () => edit(i.table, { project_id: projectId }) }))}
    />
  )
}

export function ProjectPage() {
  const id = Number(useParams().id)
  const edit = useEditor()
  const settings = useSettings()
  const project = useList('projects').find((p) => p.id === id)
  const allTasks = useList('tasks')
  const allGoals = useList('goals')
  const events = useList('events').filter((e) => e.project_id === id)
  const data: Partial<Record<CollectionName, Row[]>> = {
    trades: useList('trades').filter((x) => x.project_id === id),
    trading_topics: useList('trading_topics').filter((x) => x.project_id === id),
    sales: useList('sales').filter((x) => x.project_id === id),
    biz_expenses: useList('biz_expenses').filter((x) => x.project_id === id),
    content: useList('content').filter((x) => x.project_id === id),
    products: useList('products').filter((x) => x.project_id === id),
    partners: useList('partners').filter((x) => x.project_id === id),
    habits: useList('habits').filter((x) => x.project_id === id),
    transactions: useListWhere('transactions', { project_id: id }),
  }
  const ctx: Ctx = {
    cur: settings.currency || '₽',
    tcur: settings.trading_currency || '$',
    products: byId(useList('products')),
    customers: byId(useList('customers')),
    partnerTotals: usePartnerTotals(),
  }
  const [tab, setTab] = useState<string>('overview')
  const loaded = useLoaded('projects')
  const gp = useGoalProgress()

  if (!loaded) return null

  if (!project) {
    return (
      <Card>
        <Empty
          title="Проект не найден"
          action={
            <Link to="/projects" className="text-accent-text text-sm">
              ← К проектам
            </Link>
          }
        />
      </Card>
    )
  }

  const tasks = allTasks.filter((t) => t.project_id === id)
  const goals = allGoals.filter((g) => g.project_id === id)
  const progress = projectProgress(project, allTasks, allGoals, gp)
  const openTasks = tasks.filter((t) => t.status !== 'done')
  const upcoming = events.filter((e) => e.start.slice(0, 10) >= todayStr())
  const left = daysLeft(project.deadline)
  const linkedTabs = linked.filter((l) => (data[l.table]?.length ?? 0) > 0)

  const extraStats: ReactNode[] = []
  if (data.sales!.length || data.biz_expenses!.length) {
    const gross = sum(data.sales!.map((s) => saleProfit(s as any)))
    const exp = sum(data.biz_expenses!.map((e) => e.amount))
    extraStats.push(<Stat key="rev" label="Выручка" value={money(sum(data.sales!.map((s) => s.amount)), ctx.cur)} sub={`${data.sales!.length} продаж`} />)
    extraStats.push(
      <Stat
        key="net"
        label="Чистая прибыль"
        value={money(gross - exp, ctx.cur)}
        tone={gross - exp >= 0 ? 'good' : 'bad'}
        sub={`расходы ${money(exp, ctx.cur)}`}
      />,
    )
  }
  if (data.trades!.length) {
    const ts = tradingStats(data.trades as any, 0)
    extraStats.push(
      <Stat
        key="pnl"
        label="P&L сделок"
        value={signedMoney(ts.totalPnl, ctx.tcur, 2)}
        tone={ts.totalPnl >= 0 ? 'good' : 'bad'}
        sub={`${ts.closed} сделок · WR ${pct(ts.winRate)}`}
      />,
    )
  }
  if (data.trading_topics!.length) {
    const done = data.trading_topics!.filter((t) => t.status === 'done').length
    extraStats.push(<Stat key="learn" label="Обучение" value={`${done} / ${data.trading_topics!.length}`} sub="тем изучено" />)
  }
  if (data.partners!.length) {
    extraStats.push(
      <Stat
        key="partners"
        label="Партнёры"
        value={num(data.partners!.length)}
        sub={`${data.partners!.filter((p) => p.status === 'active').length} активных · оборот ${money(sum(data.partners!.map((p) => ctx.partnerTotals(p.id).turnover)), ctx.cur)}`}
      />,
    )
  }
  if (data.transactions!.length) {
    const inc = sum(data.transactions!.filter((t) => t.kind === 'income').map((t) => t.amount))
    const exp = sum(data.transactions!.filter((t) => t.kind === 'expense').map((t) => t.amount))
    extraStats.push(
      <Stat
        key="fin"
        label="Финансы проекта"
        value={signedMoney(inc - exp, ctx.cur)}
        tone={inc - exp >= 0 ? 'good' : 'bad'}
        sub={`доход ${money(inc, ctx.cur)} · расход ${money(exp, ctx.cur)}`}
      />,
    )
  }

  return (
    <>
      <Link to="/projects" className="mb-3 inline-flex items-center gap-1 text-[12.5px] text-fg-3 hover:text-fg">
        <ArrowLeft size={13} /> Проекты
      </Link>
      <PageHeader
        title={project.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Dot color={project.color} />
            <Badge tone={tone(projectStatuses, project.status)}>{label(projectStatuses, project.status)}</Badge>
            {project.area && <span>{project.area}</span>}
          </span>
        }
        actions={
          <>
            <Button icon={Pencil} onClick={() => edit('projects', project)}>
              Изменить
            </Button>
            <AddLinked projectId={id} />
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="px-4 py-3.5">
          <div className="text-[12.5px] text-fg-2">Прогресс {project.progress == null && <span className="text-fg-3">(авто)</span>}</div>
          <div className="mt-1.5 text-[22px] leading-tight font-semibold">{Math.round(progress * 100)}%</div>
          <Progress value={progress} color={project.color || undefined} className="mt-2" />
        </Card>
        <Stat label="Открытые задачи" value={openTasks.length} sub={`${tasks.length - openTasks.length} выполнено`} />
        <Stat label="Цели" value={goals.filter((g) => g.status === 'active').length} sub={`${goals.filter((g) => g.status === 'done').length} достигнуто`} />
        <Stat
          label="Дедлайн"
          value={project.deadline ? fmtDate(project.deadline, 'd MMM yyyy') : '—'}
          sub={left == null ? 'не задан' : left >= 0 ? `осталось ${left} дн.` : `просрочен на ${-left} дн.`}
          tone={left != null && left < 0 && project.status !== 'done' ? 'bad' : null}
        />
        {extraStats}
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Обзор' },
          { value: 'tasks', label: 'Задачи', count: openTasks.length },
          { value: 'events', label: 'Календарь', count: upcoming.length },
          { value: 'goals', label: 'Цели', count: goals.length },
          ...linkedTabs.map((l) => ({ value: l.table, label: l.label, count: data[l.table]!.length })),
        ]}
      />

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            {(project.goal || project.description) && (
              <Card className="space-y-3 p-4 text-[13.5px] leading-relaxed">
                {project.goal && (
                  <div>
                    <div className="mb-1 text-[12.5px] font-medium text-fg-3">Цель</div>
                    <p className="whitespace-pre-wrap">{project.goal}</p>
                  </div>
                )}
                {project.description && (
                  <div>
                    <div className="mb-1 text-[12.5px] font-medium text-fg-3">Описание</div>
                    <p className="whitespace-pre-wrap text-fg-2">{project.description}</p>
                  </div>
                )}
              </Card>
            )}
            <Card>
              <CardHeader
                title="Задачи"
                sub={openTasks.length || undefined}
                action={
                  <Button size="sm" variant="ghost" icon={Plus} onClick={() => edit('tasks', { project_id: id })}>
                    Задача
                  </Button>
                }
              />
              <TaskList tasks={openTasks} hideProject empty="Открытых задач нет" />
            </Card>
          </div>
          <div className="space-y-4">
            <Card>
              <CardHeader
                title="Цели"
                action={
                  <Button size="sm" variant="ghost" icon={Plus} onClick={() => edit('goals', { project_id: id })}>
                    Цель
                  </Button>
                }
              />
              <GoalList goals={goals.filter((g) => g.status === 'active')} hideProject />
            </Card>
            <Card>
              <CardHeader
                title="Ближайшие события"
                action={
                  <Button size="sm" variant="ghost" icon={Plus} onClick={() => edit('events', { project_id: id })}>
                    Событие
                  </Button>
                }
              />
              <EventList events={upcoming.slice(0, 6)} empty="Нет запланированных событий" />
            </Card>
          </div>
        </div>
      )}

      {tab === 'tasks' && (
        <Card>
          <CardHeader
            title="Все задачи проекта"
            action={
              <Button size="sm" variant="ghost" icon={Plus} onClick={() => edit('tasks', { project_id: id })}>
                Задача
              </Button>
            }
          />
          <TaskList tasks={tasks} hideProject />
        </Card>
      )}
      {tab === 'events' && (
        <Card>
          <CardHeader
            title="События проекта"
            action={
              <Button size="sm" variant="ghost" icon={Plus} onClick={() => edit('events', { project_id: id })}>
                Событие
              </Button>
            }
          />
          <EventList events={events} />
        </Card>
      )}
      {tab === 'goals' && (
        <Card>
          <CardHeader
            title="Цели проекта"
            action={
              <Button size="sm" variant="ghost" icon={Plus} onClick={() => edit('goals', { project_id: id })}>
                Цель
              </Button>
            }
          />
          <GoalList goals={goals} hideProject />
        </Card>
      )}
      {linkedTabs.map(
        (l) =>
          tab === l.table && (
            <Card key={l.table}>
              <CardHeader
                title={l.label}
                action={
                  <Button size="sm" variant="ghost" icon={Plus} onClick={() => edit(l.table, { project_id: id })}>
                    {l.add}
                  </Button>
                }
              />
              <div className="divide-y divide-line">
                {data[l.table]!.map((r) => {
                  const v = l.row(r, ctx)
                  return (
                    <div key={r.id} onClick={() => edit(l.table, r)} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-hover">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px]">{v.title}</div>
                        {v.sub && <div className="mt-0.5 truncate text-[12px] text-fg-3">{v.sub}</div>}
                      </div>
                      {v.right && <div className="shrink-0 text-[12.5px] tabular">{v.right}</div>}
                    </div>
                  )
                })}
              </div>
            </Card>
          ),
      )}
    </>
  )
}
