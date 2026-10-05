import { useState } from 'react'
import clsx from 'clsx'
import { Image, Plus } from 'lucide-react'
import { type Topic, type Trade, useList, useSave, useSettings } from '@/shared/api'
import { fmtDate, label, lastMonths, money, monthKey, num, pct, signedMoney, sum, tone } from '@/shared/lib'
import { Badge, Button, Card, CardHeader, Empty, FilterSelect, PageHeader, Progress, SearchInput, Stat, StatusPicker, Table, Tabs } from '@/shared/ui'
import { BarsChart, TrendChart } from '@/shared/ui/charts'
import { directions, groupTrades, netPnl, topicStatuses, tradingStats } from '@/entities/trade'
import { useEditor } from '@/features/edit-record'
import { ModuleSettings } from '@/features/module-settings'
import { GoalList } from '@/widgets/goal-list'

type Tab = 'overview' | 'journal' | 'learning' | 'goals'

export function TradingPage() {
  const settings = useSettings()
  const cur = settings.trading_currency || '$'
  const start = settings.trading_start_balance ?? 0
  const trades = useList('trades')
  const topics = useList('trading_topics')
  const goals = useList('goals')
  const edit = useEditor()
  const [tab, setTab] = useState<Tab>('overview')
  const s = tradingStats(trades, start)
  const m = (v: number, d = 2) => money(v, cur, d)
  const topicsDone = topics.filter((t) => t.status === 'done').length
  const tradingGoals = settings.trading_project_id ? goals.filter((g) => g.project_id === settings.trading_project_id) : []

  return (
    <>
      <PageHeader
        title="Трейдинг"
        subtitle="Журнал сделок, статистика и прогресс обучения"
        actions={
          <>
            <ModuleSettings
              title="Настройки трейдинга"
              items={[
                {
                  key: 'trading_start_balance',
                  label: 'Начальный баланс',
                  type: 'number',
                  suffix: settings.trading_currency || '$',
                  hint: 'От него считается текущий баланс и просадка',
                },
                { key: 'trading_currency', label: 'Валюта счёта', type: 'currency' },
                { key: 'trading_project_id', label: 'Проект трейдинга', type: 'project', hint: 'Новые сделки и темы автоматически привязываются к нему' },
              ]}
            />
            <Button variant="primary" icon={Plus} onClick={() => edit('trades')}>
              Сделка
            </Button>
          </>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Обзор' },
          { value: 'journal', label: 'Журнал сделок', count: trades.length },
          { value: 'learning', label: 'Обучение', count: topics.length },
          { value: 'goals', label: 'Цели', count: tradingGoals.length },
        ]}
      />

      {tab === 'overview' && <Overview s={s} start={start} cur={cur} m={m} trades={trades} topicsDone={topicsDone} topicsTotal={topics.length} />}
      {tab === 'journal' && <Journal cur={cur} />}
      {tab === 'learning' && <Learning topics={topics} />}
      {tab === 'goals' && (
        <Card>
          <CardHeader
            title="Цели по трейдингу"
            action={
              settings.trading_project_id ? (
                <Button size="sm" variant="ghost" icon={Plus} onClick={() => edit('goals', { project_id: settings.trading_project_id })}>
                  Цель
                </Button>
              ) : null
            }
          />
          {settings.trading_project_id ? (
            <GoalList goals={tradingGoals} hideProject />
          ) : (
            <Empty
              title="Проект трейдинга не выбран"
              hint="Создайте проект «Трейдинг» и выберите его в настройках раздела — тогда цели, задачи и сделки соберутся вместе"
            />
          )}
        </Card>
      )}
    </>
  )
}

function Overview({
  s,
  start,
  cur,
  m,
  trades,
  topicsDone,
  topicsTotal,
}: {
  s: ReturnType<typeof tradingStats>
  start: number
  cur: string
  m: (v: number, d?: number) => string
  trades: Trade[]
  topicsDone: number
  topicsTotal: number
}) {
  const edit = useEditor()
  if (!trades.length) {
    return (
      <Card>
        <Empty
          title="Сделок пока нет"
          hint="Добавьте первую сделку — статистика, кривая баланса и разбор по стратегиям появятся автоматически"
          action={
            <Button variant="primary" icon={Plus} onClick={() => edit('trades')}>
              Добавить сделку
            </Button>
          }
        />
      </Card>
    )
  }
  const months = lastMonths(12).map((mo) => ({
    month: mo.label,
    pnl: sum(trades.filter((t) => t.pnl != null && monthKey(t.date) === mo.key).map(netPnl)),
  }))
  const byStrategy = groupTrades(trades, (t) => t.strategy)
  const byInstrument = groupTrades(trades, (t) => t.instrument)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Баланс"
          value={m(s.balance)}
          sub={
            start
              ? `старт ${m(start)} · ${s.balance >= start ? '+' : ''}${num(((s.balance - start) / start) * 100, 1)}%`
              : 'задайте начальный баланс в настройках'
          }
        />
        <Stat
          label="Прибыль / убыток"
          value={signedMoney(s.totalPnl, cur, 2)}
          tone={s.totalPnl >= 0 ? 'good' : 'bad'}
          sub={`${s.closed} закрытых из ${s.count}`}
        />
        <Stat label="Win Rate" value={pct(s.winRate, 1)} sub={`${s.wins} прибыльных · ${s.losses} убыточных`} />
        <Stat
          label="Profit Factor"
          value={Number.isFinite(s.profitFactor) ? num(s.profitFactor, 2) : '∞'}
          sub={`мат. ожидание ${signedMoney(s.expectancy, cur, 2)}`}
        />
        <Stat label="Средняя прибыль" value={m(s.avgWin)} tone="good" sub={`лучшая ${m(s.bestTrade)}`} />
        <Stat label="Средний убыток" value={m(s.avgLoss)} tone="bad" sub={`худшая ${m(s.worstTrade)}`} />
        <Stat label="Макс. просадка" value={m(-s.maxDrawdown)} sub={pct(s.maxDrawdownPct, 1) + ' от пика'} tone={s.maxDrawdown ? 'bad' : null} />
        <Stat label="Средний R" value={s.avgR == null ? '—' : `${num(s.avgR, 2)}R`} sub={s.avgR == null ? 'укажите риск в сделках' : 'прибыль / риск'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader title="Кривая баланса" />
          <div className="px-2 pb-3">
            <TrendChart data={s.equity} x="label" y="balance" name="Баланс" fmt={(v) => m(v)} baseline={start} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Обучение" />
          <div className="px-4 pb-4">
            <div className="text-[22px] font-semibold">
              {topicsDone} <span className="text-[14px] font-normal text-fg-3">/ {topicsTotal} тем</span>
            </div>
            <Progress value={topicsTotal ? topicsDone / topicsTotal : 0} className="mt-2" />
            <div className="mt-6 text-[12.5px] font-medium text-fg-2">Результат по месяцам</div>
            <BarsChart
              data={months.slice(-6)}
              x="month"
              bars={[{ key: 'pnl', name: 'P&L', color: 'var(--s1)' }]}
              fmt={(v) => signedMoney(v, cur, 2)}
              height={150}
              signed
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {[
          { title: 'По стратегиям', rows: byStrategy },
          { title: 'По инструментам', rows: byInstrument },
        ].map((g) => (
          <Card key={g.title}>
            <CardHeader title={g.title} />
            <Table>
              <thead>
                <tr>
                  <th>Название</th>
                  <th className="text-right!">Сделок</th>
                  <th className="text-right!">Win Rate</th>
                  <th className="text-right!">P&L</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td className="text-right tabular">{r.count}</td>
                    <td className="text-right tabular">{pct(r.winRate)}</td>
                    <td className={clsx('text-right font-medium tabular', r.pnl >= 0 ? 'text-good' : 'text-bad')}>{signedMoney(r.pnl, cur, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ))}
      </div>
    </div>
  )
}

function Journal({ cur }: { cur: string }) {
  const trades = useList('trades')
  const edit = useEditor()
  const [q, setQ] = useState('')
  const [result, setResult] = useState('')
  const [strategy, setStrategy] = useState('')
  const strategies = [...new Set(trades.map((t) => t.strategy).filter(Boolean))] as string[]
  const shown = trades
    .filter((t) => !q || [t.instrument, t.comment, t.setup_reason, t.mistakes].join(' ').toLowerCase().includes(q.toLowerCase()))
    .filter((t) => !strategy || t.strategy === strategy)
    .filter((t) => !result || (result === 'open' ? t.pnl == null : result === 'win' ? t.pnl != null && netPnl(t) > 0 : t.pnl != null && netPnl(t) <= 0))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Инструмент, заметки…" />
        <FilterSelect
          value={result}
          onChange={setResult}
          all="Все результаты"
          options={[
            { value: 'win', label: 'Прибыльные' },
            { value: 'loss', label: 'Убыточные' },
            { value: 'open', label: 'Открытые' },
          ]}
        />
        <FilterSelect value={strategy} onChange={setStrategy} all="Все стратегии" options={strategies.map((s) => ({ value: s, label: s }))} />
      </div>
      <Card>
        {!shown.length ? (
          <Empty title="Сделок не найдено" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Инструмент</th>
                <th>Напр.</th>
                <th className="text-right!">Вход</th>
                <th className="text-right!">Выход</th>
                <th className="text-right!">SL</th>
                <th className="text-right!">TP</th>
                <th className="text-right!">Риск</th>
                <th className="text-right!">R</th>
                <th className="text-right!">P&L</th>
                <th>Стратегия</th>
                <th>Ошибки</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => {
                const p = t.pnl == null ? null : netPnl(t)
                return (
                  <tr key={t.id} onClick={() => edit('trades', t)} className="cursor-pointer hover:bg-hover">
                    <td className="whitespace-nowrap text-fg-2">{fmtDate(t.date, 'd MMM yy')}</td>
                    <td className="font-medium">{t.instrument}</td>
                    <td>
                      <Badge tone={tone(directions, t.direction)}>{label(directions, t.direction)}</Badge>
                    </td>
                    <td className="text-right tabular">{num(t.entry, 5)}</td>
                    <td className="text-right tabular">{num(t.exit, 5)}</td>
                    <td className="text-right text-fg-3 tabular">{num(t.stop_loss, 5)}</td>
                    <td className="text-right text-fg-3 tabular">{num(t.take_profit, 5)}</td>
                    <td className="text-right tabular">{t.risk ? money(t.risk, cur, 2) : '—'}</td>
                    <td className="text-right tabular">{p != null && t.risk ? `${num(p / t.risk, 2)}R` : '—'}</td>
                    <td className={clsx('text-right font-medium whitespace-nowrap tabular', p == null ? 'text-fg-3' : p >= 0 ? 'text-good' : 'text-bad')}>
                      {p == null ? 'открыта' : signedMoney(p, cur, 2)}
                    </td>
                    <td className="text-fg-2">{t.strategy || '—'}</td>
                    <td className="max-w-48 truncate text-[12.5px] text-fg-2">{t.mistakes || '—'}</td>
                    <td>{t.screenshot && <Image size={14} className="text-fg-3" aria-label="Есть скриншот" />}</td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}

function Learning({ topics }: { topics: Topic[] }) {
  const edit = useEditor()
  const save = useSave('trading_topics')
  const cats = [...new Set(topics.map((t) => t.category || 'Без раздела'))].sort()
  const done = topics.filter((t) => t.status === 'done').length
  if (!topics.length) {
    return (
      <Card>
        <Empty
          title="План обучения пуст"
          hint="Добавляйте темы — Risk Management, Price Action, психология — и отмечайте прогресс"
          action={
            <Button variant="primary" icon={Plus} onClick={() => edit('trading_topics')}>
              Добавить тему
            </Button>
          }
        />
      </Card>
    )
  }
  return (
    <>
      <Card className="mb-4 flex flex-wrap items-center gap-4 p-4">
        <div className="min-w-48 flex-1">
          <div className="mb-1.5 flex justify-between text-[12.5px]">
            <span className="text-fg-2">Общий прогресс обучения</span>
            <span className="font-medium tabular">
              {done} / {topics.length} · {pct(done / topics.length)}
            </span>
          </div>
          <Progress value={done / topics.length} />
        </div>
        <Button variant="primary" icon={Plus} onClick={() => edit('trading_topics')}>
          Тема
        </Button>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {cats.map((c) => {
          const list = topics.filter((t) => (t.category || 'Без раздела') === c)
          const d = list.filter((t) => t.status === 'done').length
          return (
            <Card key={c}>
              <CardHeader
                title={c}
                sub={`${d}/${list.length}`}
                action={
                  <Button size="sm" variant="ghost" icon={Plus} onClick={() => edit('trading_topics', { category: c === 'Без раздела' ? null : c })}>
                    Тема
                  </Button>
                }
              />
              <div className="divide-y divide-line">
                {list.map((t) => (
                  <div key={t.id} onClick={() => edit('trading_topics', t)} className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-hover">
                    <span className={clsx('min-w-0 flex-1 truncate text-[13.5px]', t.status === 'done' && 'text-fg-3')}>{t.title}</span>
                    <StatusPicker
                      value={t.status || 'todo'}
                      options={topicStatuses}
                      label="Статус темы"
                      onChange={(v) => save.mutate({ id: t.id, status: v as Topic['status'] })}
                    />
                  </div>
                ))}
              </div>
            </Card>
          )
        })}
      </div>
    </>
  )
}
