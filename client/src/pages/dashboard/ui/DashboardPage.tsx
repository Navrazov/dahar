import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { addDays, format } from 'date-fns'
import { Plus } from 'lucide-react'
import { byId, useFinanceSummary, useList, useSave, useSettings, type ModuleKey } from '@/shared/api'
import { money, monthKey, pct, plural, relDate, signedMoney, sum, todayStr, ymd } from '@/shared/lib'
import { Button, Card, CardHeader, Dot, Empty, Input, Progress } from '@/shared/ui'
import { TrendChart } from '@/shared/ui/charts'
import { businessMonth } from '@/entities/business'
import { useGoalProgress } from '@/entities/goal'
import { freqText, habitStats, isScheduled, useLogMap } from '@/entities/habit'
import { isEnabled, moduleLabel } from '@/entities/module'
import { projectProgress } from '@/entities/project'
import { netPnl, tradingStats } from '@/entities/trade'
import { useEditor } from '@/features/edit-record'
import { HabitCell } from '@/features/habit-check'
import { EventList } from '@/widgets/event-list'
import { GoalList } from '@/widgets/goal-list'
import { TaskList } from '@/widgets/task-list'

type Metric = { to: string; label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | null }

function MetricStrip({ items }: { items: Metric[] }) {
  return (
    <Card className="mb-8 grid grid-cols-2 overflow-hidden sm:grid-cols-3 xl:grid-flow-col xl:auto-cols-fr xl:grid-cols-none">
      {items.map((m) => (
        <Link key={m.to} to={m.to} className="group -mt-px -ml-px border-t border-l border-line px-4 py-3.5 transition-colors hover:bg-hover">
          <div className="truncate text-[12.5px] text-fg-2">{m.label}</div>
          <div
            className={clsx(
              'mt-1 text-[21px] leading-tight font-semibold tracking-[-0.02em] tabular',
              m.tone === 'good' && 'text-good',
              m.tone === 'bad' && 'text-bad',
            )}
          >
            {m.value}
          </div>
          {m.sub != null && <div className="mt-0.5 truncate text-[12px] text-fg-3">{m.sub}</div>}
        </Link>
      ))}
    </Card>
  )
}

const more = (to: string, text: string) => (
  <Link to={to} className="text-[13.5px] text-fg-3 hover:text-fg">
    {text}
  </Link>
)

const toneOf = (v: number) => (v > 0 ? 'good' : v < 0 ? 'bad' : null)

export function DashboardPage() {
  const settings = useSettings()
  const cur = settings.currency || '₽'
  const tcur = settings.trading_currency || '$'
  const edit = useEditor()
  const gp = useGoalProgress()
  const saveTask = useSave('tasks')
  const [quick, setQuick] = useState('')

  const tasks = useList('tasks')
  const events = useList('events')
  const projects = useList('projects')
  const goals = useList('goals')
  const habits = useList('habits').filter((h) => !h.archived)
  const logs = useList('habit_logs')
  const partners = useList('partners')
  const partnerReports = useList('partner_reports')
  const trades = useList('trades')
  const sales = useList('sales')
  const bizExp = useList('biz_expenses')
  const projectMap = byId(projects)
  const logMap = useLogMap(logs)

  const today = todayStr()
  const month = today.slice(0, 7)
  const weekAhead = ymd(addDays(new Date(), 7))
  const todays = tasks.filter((t) => t.status !== 'done' && t.due_date && t.due_date <= today)
  const doneToday = tasks.filter((t) => t.status === 'done' && t.completed_at?.slice(0, 10) === today)
  const overdue = todays.filter((t) => t.due_date! < today).length
  const upcoming = events.filter((e) => {
    const start = e.start.slice(0, 10)
    return (start >= today && start <= weekAhead) || (e.end && start < today && e.end.slice(0, 10) >= today)
  })
  const eventsToday = upcoming.filter((e) => e.start.slice(0, 10) === today).length
  const dueHabits = habits.filter((h) => h.kind === 'quit' || h.frequency === 'weekly' || isScheduled(h, new Date()))
  const habitsDone = dueHabits.filter((h) => habitStats(h, logs).doneToday).length

  const active = projects.filter((p) => p.status === 'active' || (p.pinned && p.status !== 'archived'))
  const activeGoals = goals.filter((g) => g.status === 'active').sort((a, b) => (a.deadline || '9').localeCompare(b.deadline || '9'))
  const soon = ymd(addDays(new Date(), 3))
  const partnerActions = partners
    .filter((p) => p.next_action && p.next_action_date && p.next_action_date <= soon)
    .sort((a, b) => a.next_action_date!.localeCompare(b.next_action_date!))

  const summary = useFinanceSummary(month)
  const income = summary?.income ?? 0
  const expense = summary?.expense ?? 0
  const biz = businessMonth(sales, bizExp, month)
  const ts = tradingStats(trades, settings.trading_start_balance ?? 0)
  const monthPnl = sum(trades.filter((t) => t.pnl != null && monthKey(t.date) === month).map(netPnl))

  const on = (k: ModuleKey) => isEnabled(settings, k)
  const isEmpty = !projects.length && !tasks.length && !habits.length

  const summaryLine = [
    todays.length
      ? `${todays.length} ${plural(todays.length, 'задача', 'задачи', 'задач')}${overdue ? `, ${overdue} просрочено` : ''}`
      : 'задач на сегодня нет',
    dueHabits.length ? `привычки ${habitsDone} из ${dueHabits.length}` : null,
    eventsToday ? `${eventsToday} ${plural(eventsToday, 'событие', 'события', 'событий')}` : null,
  ].filter(Boolean)

  const metrics: Metric[] = [
    {
      to: '/tasks',
      label: 'Задачи сегодня',
      value: `${doneToday.length} из ${doneToday.length + todays.length}`,
      sub: overdue ? `${overdue} просрочено` : 'выполнено',
      tone: overdue ? 'bad' : null,
    },
  ]
  if (on('habits'))
    metrics.push({
      to: '/habits',
      label: 'Привычки',
      value: `${habitsDone} из ${dueHabits.length}`,
      sub: dueHabits.length ? `${pct(habitsDone / dueHabits.length)} на сегодня` : 'не заведены',
    })
  if (on('finance'))
    metrics.push({
      to: '/finance',
      label: 'Деньги за месяц',
      value: signedMoney(income - expense, cur),
      tone: toneOf(income - expense),
      sub: `+${money(income, cur)} / −${money(expense, cur)}`,
    })
  if (on('business'))
    metrics.push({
      to: '/business',
      label: moduleLabel(settings, 'business'),
      value: money(biz.net, cur),
      tone: toneOf(biz.net),
      sub: `выручка ${money(biz.revenue, cur)}`,
    })
  if (on('trading'))
    metrics.push({
      to: '/trading',
      label: 'Трейдинг за месяц',
      value: signedMoney(monthPnl, tcur),
      tone: toneOf(monthPnl),
      sub: `баланс ${money(ts.balance, tcur)}`,
    })
  if (on('partners')) {
    const applications = sum(partnerReports.filter((r) => monthKey(r.date) === month).map((r) => r.applications))
    metrics.push({
      to: '/partners',
      label: 'Партнёры',
      value: `${partners.filter((p) => p.status === 'active').length} активных`,
      sub: `${applications} заявок за месяц`,
    })
  }

  const addQuick = () => {
    if (!quick.trim()) return
    saveTask.mutate({ title: quick.trim(), due_date: today, status: 'todo', priority: 'medium' })
    setQuick('')
  }

  return (
    <>
      <header className="mb-7">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] first-letter:uppercase">{format(new Date(), 'EEEE, d MMMM')}</h1>
        <p className="mt-1.5 text-[14px] text-fg-2 first-letter:uppercase">
          {settings.user_name ? `${settings.user_name}, ` : ''}
          {summaryLine.join(' · ')}
        </p>
      </header>

      {isEmpty && (
        <Card className="mb-8 flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0 max-w-xl">
            <div className="text-[15px] font-semibold">С чего начать</div>
            <p className="mt-1 text-[14px] text-fg-2">
              Подключите нужные направления и заведите первый проект. Или загрузите пример в настройках, чтобы посмотреть, как всё связано.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/settings#modules">
              <Button>Направления</Button>
            </Link>
            <Button variant="primary" icon={Plus} onClick={() => edit('projects')}>
              Проект
            </Button>
          </div>
        </Card>
      )}

      <MetricStrip items={metrics} />

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Сегодня" sub={todays.length || undefined} action={more('/tasks', 'Все задачи')} />
            <div className="flex items-center gap-3 border-y border-line px-4">
              <Plus size={16} className="shrink-0 text-fg-3" />
              <Input
                value={quick}
                onChange={(e) => setQuick(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addQuick()}
                placeholder="Новая задача на сегодня"
                className="border-0 px-0 hover:border-0 focus:ring-0"
              />
            </div>
            <TaskList
              tasks={[...todays, ...doneToday]}
              empty={tasks.length ? 'На сегодня всё сделано' : 'На сегодня задач нет'}
              emptyHint={tasks.length ? 'Можно заглянуть в проекты или запланировать завтра' : 'Напишите задачу в поле выше или нажмите N'}
            />
          </Card>

          <Card>
            <CardHeader title="Проекты в работе" action={more('/projects', 'Все проекты')} />
            {!active.length ? (
              <Empty
                title="Нет активных проектов"
                action={
                  <Button size="sm" icon={Plus} onClick={() => edit('projects')}>
                    Проект
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-x-8 px-4 pb-3 sm:grid-cols-2">
                {active.map((p) => {
                  const pr = projectProgress(p, tasks, goals, gp)
                  const open = tasks.filter((t) => t.project_id === p.id && t.status !== 'done').length
                  return (
                    <Link key={p.id} to={`/projects/${p.id}`} className="-mx-2 block rounded-[8px] px-2 py-2.5 hover:bg-hover">
                      <div className="mb-2 flex items-center gap-2 text-[14px]">
                        <Dot color={p.color} />
                        <span className="truncate font-medium">{p.name}</span>
                        <span className="ml-auto shrink-0 text-[12.5px] text-fg-3 tabular">
                          {open} {plural(open, 'задача', 'задачи', 'задач')} · {Math.round(pr * 100)}%
                        </span>
                      </div>
                      <Progress value={pr} color={p.color || undefined} size="sm" />
                    </Link>
                  )
                })}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Цели" action={more('/goals', 'Все цели')} />
            <GoalList goals={activeGoals.slice(0, 6)} />
          </Card>
        </div>

        <div className="space-y-5">
          {on('habits') && (
            <Card>
              <CardHeader title="Привычки" sub={dueHabits.length ? `${habitsDone}/${dueHabits.length}` : undefined} action={more('/habits', 'Трекер')} />
              {!dueHabits.length ? (
                <Empty
                  title="На сегодня привычек нет"
                  action={
                    <Button size="sm" icon={Plus} onClick={() => edit('habits')}>
                      Привычка
                    </Button>
                  }
                />
              ) : (
                <div className="divide-y divide-line">
                  {dueHabits.map((h) => {
                    const s = habitStats(h, logs)
                    return (
                      <div key={h.id} className="flex items-center gap-3 px-4 py-2.5">
                        <HabitCell habit={h} date={today} logs={logMap} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px]">{h.name}</div>
                          <div className="text-[12px] text-fg-3">{h.kind === 'quit' ? 'Отметьте, если был срыв' : freqText(h)}</div>
                        </div>
                        {s.streak > 0 && (
                          <span className="text-[12.5px] text-fg-3 tabular" title="Серия">
                            {s.streak} {s.streakUnit} подряд
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          )}

          <Card>
            <CardHeader title="Ближайшая неделя" action={more('/calendar', 'Календарь')} />
            <EventList events={upcoming.slice(0, 7)} empty="Событий нет" />
          </Card>

          {on('partners') && partnerActions.length > 0 && (
            <Card>
              <CardHeader title="Партнёры: следующие шаги" />
              <div className="divide-y divide-line">
                {partnerActions.slice(0, 6).map((p) => (
                  <Link key={p.id} to="/partners" className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px]">{p.next_action}</div>
                      <div className="text-[12px] text-fg-3">
                        {p.name}
                        {p.project_id ? ` · ${projectMap.get(p.project_id)?.name ?? ''}` : ''}
                      </div>
                    </div>
                    <span className={clsx('shrink-0 text-[12.5px]', p.next_action_date! < today ? 'text-bad' : 'text-fg-3')}>
                      {relDate(p.next_action_date)}
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {on('trading') && ts.closed > 1 && (
            <Card>
              <CardHeader title="Торговый счёт" sub={money(ts.balance, tcur)} />
              <div className="px-2 pb-2">
                <TrendChart data={ts.equity} x="label" y="balance" name="Баланс" fmt={(v) => money(v, tcur, 2)} height={140} />
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
