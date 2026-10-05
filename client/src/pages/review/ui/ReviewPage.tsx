import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { addDays, addWeeks, eachDayOfInterval, format, parseISO, startOfISOWeek } from 'date-fns'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { api, type Review as ReviewRow, useList, useListWhere, useSave, useSettings } from '@/shared/api'
import { money, pct, signedMoney, sum, todayStr, ymd } from '@/shared/lib'
import { Button, Card, CardHeader, Empty, FieldLabel, IconButton, Input, PageHeader, Progress, Stat, Textarea } from '@/shared/ui'
import { saleProfit } from '@/entities/business'
import { useGoalProgress } from '@/entities/goal'
import { isScheduled } from '@/entities/habit'
import { isEnabled } from '@/entities/module'
import { netPnl } from '@/entities/trade'
import { useEditor } from '@/features/edit-record'
import { GoalList } from '@/widgets/goal-list'
import { WeekInsight } from './WeekInsight'
import { TaskList } from '@/widgets/task-list'

const weekOf = (d: Date) => ymd(startOfISOWeek(d))

export function ReviewPage() {
  useEffect(() => {
    api.activation('weekly_review_opened').catch(() => {})
  }, [])
  const qc = useQueryClient()
  const [week, setWeek] = useState(() => weekOf(new Date()))
  const settings = useSettings()
  const cur = settings.currency || '₽'
  const tcur = settings.trading_currency || '$'
  const edit = useEditor()
  const gp = useGoalProgress()

  const start = week
  const end = ymd(addDays(parseISO(week), 6))
  const nextStart = ymd(addDays(parseISO(week), 7))
  const nextEnd = ymd(addDays(parseISO(week), 13))
  const today = todayStr()
  const lastDay = end < today ? end : today
  const inWeek = (d: string | null | undefined) => !!d && d.slice(0, 10) >= start && d.slice(0, 10) <= end

  const tasks = useList('tasks')
  const habits = useList('habits').filter((h) => !h.archived)
  const logs = useList('habit_logs')
  const goals = useList('goals').filter((g) => g.status === 'active')
  const partners = useList('partners')
  const interactions = useList('partner_interactions')
  const trades = useList('trades')
  const sales = useList('sales')
  const bizExp = useList('biz_expenses')
  const txns = useListWhere('transactions', { from: start, to: end })

  const done = tasks.filter((t) => t.status === 'done' && inWeek(t.completed_at))
  const overdue = tasks.filter((t) => t.status !== 'done' && t.due_date && t.due_date < (end < today ? end : today))
  const nextWeek = tasks.filter((t) => t.status !== 'done' && t.due_date && t.due_date >= nextStart && t.due_date <= nextEnd)

  const days = start > today ? [] : eachDayOfInterval({ start: parseISO(start), end: parseISO(lastDay) })
  const habitRows = habits.map((h) => {
    const mine = new Map(logs.filter((l) => l.habit_id === h.id).map((l) => [l.date, l.status]))
    const due = days.filter(
      (d) => ymd(d) >= (h.start_date || h.created_at.slice(0, 10)) && (h.kind === 'quit' || h.frequency === 'weekly' || isScheduled(h, d)),
    )
    if (h.kind !== 'quit' && h.frequency === 'weekly') {
      const n = due.filter((d) => mine.get(ymd(d)) === 'done').length
      return { h, ok: n, total: Math.max(1, h.per_week || 1), rate: Math.min(1, n / Math.max(1, h.per_week || 1)) }
    }
    const ok = due.filter((d) => mine.get(ymd(d)) === 'done').length
    return { h, ok, total: due.length, rate: due.length ? ok / due.length : 0 }
  })
  const habitAvg = habitRows.length ? sum(habitRows.map((r) => r.rate)) / habitRows.length : 0

  const income = sum(txns.filter((t) => t.kind === 'income').map((t) => t.amount))
  const expense = sum(txns.filter((t) => t.kind === 'expense').map((t) => t.amount))
  const weekSales = sales.filter((s) => inWeek(s.date))
  const bizNet = sum(weekSales.map(saleProfit)) - sum(bizExp.filter((e) => inWeek(e.date)).map((e) => e.amount))
  const weekTrades = trades.filter((t) => inWeek(t.date) && t.pnl != null)
  const tradePnl = sum(weekTrades.map(netPnl))
  const touches = interactions.filter((i) => inWeek(i.date)).length
  const newPartners = partners.filter((p) => inWeek(p.created_at.slice(0, 10))).length

  const label = `${format(parseISO(start), 'd MMM')} — ${format(parseISO(end), 'd MMM yyyy')}`
  const isCurrent = week === weekOf(new Date())

  return (
    <>
      <PageHeader title="Обзор недели" subtitle="Итоги по всем направлениям, план и выводы — ритуал на конец недели" />
      <div className="mb-5 flex items-center gap-1">
        <IconButton icon={ChevronLeft} label="Предыдущая неделя" onClick={() => setWeek(ymd(addWeeks(parseISO(week), -1)))} />
        <span className="min-w-48 text-center text-[14px] font-semibold">{label}</span>
        <IconButton icon={ChevronRight} label="Следующая неделя" onClick={() => setWeek(ymd(addWeeks(parseISO(week), 1)))} />
        {!isCurrent && (
          <Button size="sm" variant="ghost" onClick={() => setWeek(weekOf(new Date()))}>
            Текущая
          </Button>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
        <Stat
          label="Задач выполнено"
          value={done.length}
          sub={overdue.length ? `${overdue.length} просрочено` : 'просроченных нет'}
          tone={overdue.length ? null : 'good'}
        />
        {isEnabled(settings, 'habits') && <Stat label="Привычки" value={pct(habitAvg)} sub="среднее выполнение" />}
        {isEnabled(settings, 'finance') && (
          <Stat
            label="Финансы"
            value={signedMoney(income - expense, cur)}
            tone={income - expense >= 0 ? 'good' : 'bad'}
            sub={`+${money(income, cur)} / −${money(expense, cur)}`}
          />
        )}
        {isEnabled(settings, 'business') && (
          <Stat label="Бизнес" value={money(bizNet, cur)} tone={bizNet >= 0 ? 'good' : 'bad'} sub={`${weekSales.length} продаж`} />
        )}
        {isEnabled(settings, 'trading') && (
          <Stat label="Трейдинг" value={signedMoney(tradePnl, tcur, 2)} tone={tradePnl >= 0 ? 'good' : 'bad'} sub={`${weekTrades.length} сделок`} />
        )}
        {isEnabled(settings, 'partners') && <Stat label="Партнёры" value={touches} sub={`контактов · новых ${newPartners}`} />}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Сделано за неделю" sub={done.length || undefined} />
            <TaskList tasks={done} empty="Выполненных задач нет" />
          </Card>
          {overdue.length > 0 && (
            <Card>
              <CardHeader
                title="Хвосты — перенести или закрыть"
                sub={overdue.length}
                action={
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await api.bulkTasks(
                          overdue.map((t) => t.id),
                          { due_date: nextStart },
                        )
                        await qc.invalidateQueries()
                        toast.success('Задачи перенесены на следующую неделю')
                      } catch (e) {
                        toast.error((e as Error).message)
                      }
                    }}
                  >
                    Перенести на понедельник
                  </Button>
                }
              />
              <TaskList tasks={overdue} />
            </Card>
          )}
          <Card>
            <CardHeader
              title="План на следующую неделю"
              sub={`${format(parseISO(nextStart), 'd MMM')} — ${format(parseISO(nextEnd), 'd MMM')}`}
              action={
                <Button size="sm" variant="ghost" icon={Plus} onClick={() => edit('tasks', { due_date: nextStart })}>
                  Задача
                </Button>
              }
            />
            <QuickPlan date={nextStart} />
            <TaskList tasks={nextWeek} empty="На следующую неделю ничего не запланировано" />
          </Card>
        </div>

        <div className="space-y-4">
          <WeekInsight week={week} />
          <Reflection week={week} />
          {isEnabled(settings, 'habits') && habitRows.length > 0 && (
            <Card>
              <CardHeader title="Привычки за неделю" />
              <div className="space-y-3 px-4 pb-4">
                {habitRows.map(({ h, ok, total, rate }) => (
                  <div key={h.id}>
                    <div className="mb-1 flex justify-between text-[12.5px]">
                      <span className="truncate">{h.name}</span>
                      <span className="shrink-0 text-fg-3 tabular">
                        {ok}/{total}
                      </span>
                    </div>
                    <Progress value={rate} color={h.color || undefined} size="sm" />
                  </div>
                ))}
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="Цели" sub={goals.length ? `средний прогресс ${pct(sum(goals.map(gp)) / goals.length)}` : undefined} />
            <GoalList goals={goals} />
          </Card>
        </div>
      </div>
    </>
  )
}

function QuickPlan({ date }: { date: string }) {
  const save = useSave('tasks')
  const [text, setText] = useState('')
  const add = async () => {
    if (!text.trim()) return
    try {
      await save.mutateAsync({ title: text.trim(), due_date: date, status: 'todo', priority: 'medium' })
      setText('')
    } catch {}
  }
  return (
    <div className="flex items-center gap-2 border-y border-line px-4 py-1.5">
      <Plus size={15} className="text-fg-3" />
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
        placeholder="Добавить задачу на понедельник — Enter"
        className="border-0 px-0 hover:border-0 focus:border-0 focus:ring-0"
      />
    </div>
  )
}

const prompts: { key: 'wins' | 'problems' | 'lessons' | 'focus'; label: string; placeholder: string }[] = [
  { key: 'wins', label: 'Что получилось', placeholder: 'Победы и результаты недели' },
  { key: 'problems', label: 'Что мешало', placeholder: 'Где буксовал и почему' },
  { key: 'lessons', label: 'Выводы', placeholder: 'Что делать иначе' },
  { key: 'focus', label: 'Фокус следующей недели', placeholder: '1–3 главных результата' },
]

function Reflection({ week }: { week: string }) {
  const reviews = useList('reviews')
  const save = useSave('reviews')
  const existing = useMemo(() => reviews.find((r) => r.week_start === week), [reviews, week])
  const [draft, setDraft] = useState<Partial<ReviewRow>>({})
  useEffect(() => {
    setDraft(existing ?? {})
  }, [existing, week])
  const dirty = prompts.some((p) => (draft[p.key] ?? '') !== (existing?.[p.key] ?? '')) || draft.rating !== existing?.rating

  const submit = async () => {
    await save.mutateAsync({
      ...(existing ? { id: existing.id } : {}),
      week_start: week,
      wins: draft.wins,
      problems: draft.problems,
      lessons: draft.lessons,
      focus: draft.focus,
      rating: draft.rating,
    })
    toast.success('Обзор недели сохранён')
  }

  const history = reviews
    .filter((r) => r.week_start !== week)
    .sort((a, b) => b.week_start.localeCompare(a.week_start))
    .slice(0, 4)

  return (
    <Card>
      <CardHeader title="Рефлексия" />
      <div className="space-y-3.5 px-4 pb-4">
        <FieldLabel label="Оценка недели" group>
          <div className="flex gap-1.5" role="radiogroup">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={draft.rating === n}
                aria-label={`${n} из 5`}
                onClick={() => setDraft((d) => ({ ...d, rating: d.rating === n ? null : n }))}
                className={clsx(
                  'h-9 w-10 rounded-[7px] border text-[14px] font-medium tabular transition-colors',
                  draft.rating === n ? 'border-ink bg-ink text-on-ink' : 'border-line text-fg-2 hover:border-line-strong hover:text-fg',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </FieldLabel>
        {prompts.map((p) => (
          <FieldLabel key={p.key} label={p.label}>
            <Textarea value={draft[p.key] ?? ''} placeholder={p.placeholder} onChange={(e) => setDraft((d) => ({ ...d, [p.key]: e.target.value }))} />
          </FieldLabel>
        ))}
        <div className="flex justify-end">
          <Button variant="primary" onClick={submit} disabled={!dirty}>
            Сохранить
          </Button>
        </div>
        {history.length > 0 && (
          <div className="border-t border-line pt-3">
            <div className="mb-2 text-[12.5px] font-medium text-fg-3">Прошлые недели</div>
            <div className="space-y-2">
              {history.map((r) => (
                <div key={r.id} className="rounded-[8px] bg-surface-2 px-3 py-2 text-[13.5px]">
                  <div className="mb-0.5 flex items-center justify-between font-medium">
                    <span>с {format(parseISO(r.week_start), 'd MMM')}</span>
                    {r.rating ? <span className="text-fg-3 tabular">{r.rating} из 5</span> : null}
                  </div>
                  {r.focus && <div className="line-clamp-2 text-fg-2">Фокус: {r.focus}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
        {!history.length && !existing && <Empty title="Первый обзор" hint="Заполняйте раз в неделю — через месяц станет видно, что реально двигает вперёд" />}
      </div>
    </Card>
  )
}
