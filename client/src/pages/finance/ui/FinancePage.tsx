import { useState } from 'react'
import clsx from 'clsx'
import { addMonths, endOfMonth, format, parseISO } from 'date-fns'
import { AlertTriangle, ArrowLeftRight, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { byId, type FinanceSummary, useFinanceSummary, useList, useListWhere, useSettings } from '@/shared/api'
import { fmtDate, label, money, pct, sum, todayStr } from '@/shared/lib'
import { Button, Card, CardHeader, Empty, FilterSelect, IconButton, PageHeader, Progress, Stat, Table, Tabs } from '@/shared/ui'
import { BarsChart, Legend, RankBars, series } from '@/shared/ui/charts'
import { accountKinds } from '@/entities/finance'
import { useEditor } from '@/features/edit-record'
import { ImportStatementButton } from './ImportStatement'
import { ModuleSettings } from '@/features/module-settings'

type Tab = 'overview' | 'transactions' | 'budgets' | 'accounts'

const monthLabel = (m: string) => format(parseISO(`${m}-01`), 'LLL').replace('.', '')

export function FinancePage() {
  const [tab, setTab] = useState<Tab>('overview')
  const [month, setMonth] = useState(todayStr().slice(0, 7))
  const edit = useEditor()
  const accounts = useList('accounts')
  const budgets = useList('budgets')
  const summary = useFinanceSummary(month)
  const shiftMonth = (d: number) => setMonth(format(addMonths(parseISO(month + '-01'), d), 'yyyy-MM'))
  const over = summary?.budgets.filter((b) => b.spent > b.amount).length ?? 0

  return (
    <>
      <PageHeader
        title="Личные финансы"
        subtitle="Доходы, расходы, бюджеты, счета, накопления и инвестиции"
        actions={
          <>
            <ModuleSettings
              title="Настройки финансов"
              items={[
                { key: 'currency', label: 'Валюта', type: 'currency', hint: 'Общая для финансов и бизнеса' },
                { key: 'default_account_id', label: 'Счёт по умолчанию', type: 'account', hint: 'Сюда записываются расходы и доходы из Telegram' },
              ]}
            />
            <ImportStatementButton />
            <Button icon={Plus} onClick={() => edit(tab === 'budgets' ? 'budgets' : 'accounts')}>
              {tab === 'budgets' ? 'Бюджет' : 'Счёт'}
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => edit('transactions', month === todayStr().slice(0, 7) ? {} : { date: `${month}-01` })}>
              Операция
            </Button>
          </>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Обзор' },
          { value: 'transactions', label: 'Операции' },
          { value: 'budgets', label: over ? `Бюджеты · ${over} превышено` : 'Бюджеты', count: over ? undefined : budgets.length },
          { value: 'accounts', label: 'Счета', count: accounts.filter((a) => !a.archived).length },
        ]}
      />
      {tab !== 'accounts' && (
        <div className="mb-4 flex items-center gap-1">
          <IconButton icon={ChevronLeft} label="Предыдущий месяц" onClick={() => shiftMonth(-1)} />
          <span className="min-w-32 text-center text-[14px] font-semibold first-letter:uppercase">{fmtDate(month + '-01', 'LLLL yyyy')}</span>
          <IconButton icon={ChevronRight} label="Следующий месяц" onClick={() => shiftMonth(1)} />
          {month !== todayStr().slice(0, 7) && (
            <Button size="sm" variant="ghost" onClick={() => setMonth(todayStr().slice(0, 7))}>
              Текущий
            </Button>
          )}
        </div>
      )}
      {tab === 'overview' && summary && <Overview s={summary} />}
      {tab === 'transactions' && <Transactions month={month} />}
      {tab === 'budgets' && summary && <Budgets s={summary} />}
      {tab === 'accounts' && <Accounts />}
    </>
  )
}

function BudgetRow({ b, cur, onClick }: { b: { category: string; amount: number; spent: number }; cur: string; onClick?: () => void }) {
  const ratio = b.amount ? b.spent / b.amount : 0
  const color = ratio > 1 ? 'var(--bad)' : ratio >= 0.8 ? 'var(--warn)' : 'var(--good)'
  return (
    <div onClick={onClick} className={clsx('px-4 py-2.5', onClick && 'cursor-pointer hover:bg-hover')}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13.5px]">
        <span className="flex items-center gap-1.5 truncate">
          {ratio > 1 && <AlertTriangle size={13} className="shrink-0 text-bad" aria-label="Превышен" />}
          {b.category}
        </span>
        <span className="shrink-0 text-[12.5px] tabular">
          <span className={clsx('font-medium', ratio > 1 && 'text-bad')}>{money(b.spent, cur)}</span>
          <span className="text-fg-3"> из {money(b.amount, cur)}</span>
        </span>
      </div>
      <Progress value={Math.min(ratio, 1)} color={color} />
      <div className="mt-1 text-[12px] text-fg-3">
        {ratio > 1 ? `Превышен на ${money(b.spent - b.amount, cur)}` : `Осталось ${money(b.amount - b.spent, cur)} · ${pct(ratio)}`}
      </div>
    </div>
  )
}

function Overview({ s }: { s: FinanceSummary }) {
  const cur = useSettings().currency || '₽'
  const accounts = useList('accounts')
  const balance = (id: number) => s.balances.find((b) => b.account_id === id)?.balance ?? 0
  const live = accounts.filter((a) => !a.archived)
  const total = sum(live.map((a) => balance(a.id)))
  const savings = sum(live.filter((a) => a.kind === 'savings').map((a) => balance(a.id)))
  const invest = sum(live.filter((a) => a.kind === 'investment').map((a) => balance(a.id)))
  const net = s.income - s.expense
  const months = s.months.map((m) => ({ ...m, label: monthLabel(m.month) }))
  const warn = s.budgets.filter((b) => b.amount && b.spent / b.amount >= 0.8)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Доход за месяц" value={money(s.income, cur)} tone="good" />
        <Stat label="Расходы за месяц" value={money(s.expense, cur)} tone="bad" />
        <Stat
          label="Остаток месяца"
          value={money(net, cur)}
          tone={net >= 0 ? 'good' : 'bad'}
          sub={s.income ? `норма сбережений ${pct(net / s.income)}` : undefined}
        />
        <Stat label="Все счета" value={money(total, cur)} />
        <Stat label="Накопления" value={money(savings, cur)} />
        <Stat label="Инвестиции" value={money(invest, cur)} />
      </div>
      {warn.length > 0 && (
        <Card>
          <CardHeader title="Бюджеты требуют внимания" />
          <div className="grid md:grid-cols-2">
            {warn.map((b) => (
              <BudgetRow key={b.id} b={b} cur={cur} />
            ))}
          </div>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader
            title="Динамика по месяцам"
            action={
              <Legend
                items={[
                  { label: 'Доход', color: 'var(--s3)' },
                  { label: 'Расходы', color: 'var(--s2)' },
                ]}
              />
            }
          />
          <div className="px-2 pb-3">
            <BarsChart
              data={months}
              x="label"
              bars={[
                { key: 'income', name: 'Доход', color: 'var(--s3)' },
                { key: 'expense', name: 'Расходы', color: 'var(--s2)' },
              ]}
              fmt={(v) => money(v, cur)}
              height={260}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Расходы по категориям" />
          <div className="px-4 pb-4">
            {s.expenseCategories.length ? (
              <RankBars items={s.expenseCategories.map((c) => ({ label: c.category, value: c.amount }))} fmt={(v) => money(v, cur)} color="var(--s2)" />
            ) : (
              <Empty title="Расходов в этом месяце нет" />
            )}
          </div>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Источники дохода" />
          <div className="px-4 pb-4">
            {s.incomeCategories.length ? (
              <RankBars items={s.incomeCategories.map((c) => ({ label: c.category, value: c.amount }))} fmt={(v) => money(v, cur)} color="var(--s3)" />
            ) : (
              <Empty title="Доходов в этом месяце нет" />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Счета" />
          {!live.length ? (
            <Empty title="Счетов нет" hint="Создайте карту, наличные, накопительный и инвестиционный счёт" />
          ) : (
            <div className="divide-y divide-line">
              {live.map((a, i) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px]">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color || series[i % series.length] }} />
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="text-[12.5px] text-fg-3">{label(accountKinds, a.kind)}</span>
                  <span className="w-28 text-right font-medium tabular">{money(balance(a.id), cur)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function Transactions({ month }: { month: string }) {
  const cur = useSettings().currency || '₽'
  const txns = useListWhere('transactions', { from: `${month}-01`, to: format(endOfMonth(parseISO(`${month}-01`)), 'yyyy-MM-dd') })
  const accounts = byId(useList('accounts'))
  const projects = byId(useList('projects'))
  const edit = useEditor()
  const [kind, setKind] = useState('')
  const [cat, setCat] = useState('')
  const cats = [...new Set(txns.map((t) => t.category).filter(Boolean))].sort() as string[]
  const shown = txns.filter((t) => (!kind || t.kind === kind) && (!cat || t.category === cat)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <FilterSelect
          value={kind}
          onChange={setKind}
          all="Все типы"
          options={[
            { value: 'income', label: 'Доходы' },
            { value: 'expense', label: 'Расходы' },
            { value: 'transfer', label: 'Переводы' },
          ]}
        />
        <FilterSelect value={cat} onChange={setCat} all="Все категории" options={cats.map((c) => ({ value: c, label: c }))} />
      </div>
      <Card>
        {!shown.length ? (
          <Empty
            title="Операций нет"
            action={
              <Button
                variant="primary"
                icon={Plus}
                onClick={() => edit('transactions', { date: month === todayStr().slice(0, 7) ? todayStr() : month + '-01' })}
              >
                Добавить операцию
              </Button>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Категория</th>
                <th>Счёт</th>
                <th>Комментарий</th>
                <th>Проект</th>
                <th className="text-right!">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id} onClick={() => edit('transactions', t)} className="cursor-pointer hover:bg-hover">
                  <td className="whitespace-nowrap text-fg-2">{fmtDate(t.date, 'd MMM')}</td>
                  <td>
                    {t.kind === 'transfer' ? (
                      <span className="flex items-center gap-1 text-fg-2">
                        <ArrowLeftRight size={12} /> Перевод
                      </span>
                    ) : (
                      t.category || '—'
                    )}
                  </td>
                  <td className="text-fg-2">
                    {t.account_id ? accounts.get(t.account_id)?.name : '—'}
                    {t.kind === 'transfer' && t.to_account_id && ` → ${accounts.get(t.to_account_id)?.name ?? ''}`}
                  </td>
                  <td className="max-w-64 truncate text-fg-2">{t.note || '—'}</td>
                  <td className="text-[12.5px] text-fg-3">{t.project_id ? projects.get(t.project_id)?.name : ''}</td>
                  <td className={clsx('text-right font-medium whitespace-nowrap tabular', t.kind === 'income' && 'text-good')}>
                    {t.kind === 'income' ? '+' : t.kind === 'expense' ? '−' : ''}
                    {money(t.amount, cur)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}

function Budgets({ s }: { s: FinanceSummary }) {
  const cur = useSettings().currency || '₽'
  const budgets = useList('budgets')
  const edit = useEditor()
  const total = sum(s.budgets.map((b) => b.amount))
  const spent = sum(s.budgets.map((b) => b.spent))
  if (!s.budgets.length) {
    return (
      <Card>
        <Empty
          title="Бюджетов пока нет"
          hint="Задайте месячный лимит для категории расходов — например, «Кафе: 8 000 ₽». При приближении к лимиту появится предупреждение"
          action={
            <Button variant="primary" icon={Plus} onClick={() => edit('budgets')}>
              Добавить бюджет
            </Button>
          }
        />
      </Card>
    )
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Лимит на месяц" value={money(total, cur)} />
        <Stat label="Потрачено" value={money(spent, cur)} tone={spent > total ? 'bad' : null} sub={total ? pct(spent / total) : undefined} />
        <Stat label="Осталось" value={money(total - spent, cur)} tone={total - spent < 0 ? 'bad' : 'good'} />
        <Stat label="Превышено" value={s.budgets.filter((b) => b.spent > b.amount).length} sub={`из ${s.budgets.length} категорий`} />
      </div>
      <Card>
        <CardHeader title="По категориям" sub="клик — изменить лимит" />
        <div className="grid md:grid-cols-2">
          {s.budgets.map((b) => (
            <BudgetRow
              key={b.id}
              b={b}
              cur={cur}
              onClick={() => edit('budgets', budgets.find((x) => x.id === b.id) ?? { id: b.id, category: b.category, amount: b.amount })}
            />
          ))}
        </div>
      </Card>
    </div>
  )
}

function Accounts() {
  const cur = useSettings().currency || '₽'
  const accounts = useList('accounts')
  const summary = useFinanceSummary(todayStr().slice(0, 7))
  const edit = useEditor()
  const balance = (id: number) => summary?.balances.find((b) => b.account_id === id)?.balance ?? 0
  if (!accounts.length) {
    return (
      <Card>
        <Empty
          title="Счетов пока нет"
          hint="Счета — это кошельки: карта, наличные, накопления, брокерский счёт"
          action={
            <Button variant="primary" icon={Plus} onClick={() => edit('accounts')}>
              Добавить счёт
            </Button>
          }
        />
      </Card>
    )
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {accounts.map((a, i) => (
        <Card
          key={a.id}
          className={clsx('cursor-pointer p-4 transition-shadow hover:shadow-sm', a.archived && 'opacity-50')}
          onClick={() => edit('accounts', a)}
        >
          <div className="flex items-center gap-2 text-[13.5px]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color || series[i % series.length] }} />
            <span className="font-medium">{a.name}</span>
            <span className="ml-auto text-[12.5px] text-fg-3">{label(accountKinds, a.kind)}</span>
          </div>
          <div className="mt-3 text-[22px] font-semibold tracking-tight tabular">{money(balance(a.id), cur)}</div>
        </Card>
      ))}
    </div>
  )
}
