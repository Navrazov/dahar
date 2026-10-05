import { useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { subDays } from 'date-fns'
import { toast } from 'sonner'
import { useFinanceSummary, useList, useListWhere, useSave, useSettings, type Account, type Txn } from '@/shared/api'
import { haptic, money, todayStr, ymd } from '@/shared/lib'
import { Button, Segmented, Skeleton } from '@/shared/ui'
import { Group } from './parts'

type Kind = 'expense' | 'income'

const parseAmount = (s: string) => {
  const n = Number(s.replace(/[\s ]/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

/** Счёт по умолчанию — как у бота: из настроек, иначе первая карта или наличные. */
function pickAccount(accounts: Account[], preferred: number | null | undefined) {
  const live = accounts.filter((a) => !a.archived)
  if (preferred && live.some((a) => a.id === preferred)) return preferred
  const rank = (a: Account) => (a.kind === 'card' ? 0 : a.kind === 'cash' ? 1 : 2)
  return [...live].sort((a, b) => rank(a) - rank(b) || a.id - b.id)[0]?.id ?? null
}

/** Частые категории за 90 дней — чтобы трату записать в два касания. */
function topCategories(txns: Txn[], kind: Kind) {
  const count = new Map<string, number>()
  for (const t of txns) if (t.kind === kind && t.category) count.set(t.category, (count.get(t.category) ?? 0) + 1)
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([c]) => c)
}

export function MoneyTab() {
  const settings = useSettings()
  const cur = settings.currency || '₽'
  const today = todayStr()
  const accounts = useList('accounts')
  const recent = useListWhere('transactions', { from: ymd(subDays(new Date(), 90)), to: today })
  const summary = useFinanceSummary(today.slice(0, 7))
  const save = useSave('transactions')

  const [kind, setKind] = useState<Kind>('expense')
  const [amountText, setAmountText] = useState('')
  const [category, setCategory] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)

  const categories = useMemo(() => topCategories(recent, kind), [recent, kind])
  const todays = recent.filter((t) => t.date === today && t.kind !== 'transfer').sort((a, b) => b.id - a.id)
  const amount = parseAmount(amountText)

  const submit = async () => {
    if (!amount) {
      haptic.error()
      amountRef.current?.focus()
      return
    }
    const cat = category.trim()
    await save.mutateAsync({
      kind,
      amount,
      category: cat ? cat[0].toUpperCase() + cat.slice(1) : null,
      date: today,
      account_id: pickAccount(accounts, settings.default_account_id),
    })
    haptic.success()
    toast.success(`${kind === 'expense' ? 'Расход' : 'Доход'} ${money(amount, cur, 2)}${cat ? ` · ${cat}` : ''}`)
    setAmountText('')
    setCategory('')
    amountRef.current?.blur()
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="rounded-[18px] border border-line bg-surface p-4"
      >
        <div className="flex justify-center">
          <Segmented
            value={kind}
            onChange={(v) => {
              haptic.select()
              setKind(v)
              setCategory('')
            }}
            options={[
              { value: 'expense', label: 'Расход' },
              { value: 'income', label: 'Доход' },
            ]}
          />
        </div>

        <label className="mt-5 flex items-baseline justify-center gap-2">
          <input
            ref={amountRef}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value.replace(/[^\d\s,.]/g, ''))}
            inputMode="decimal"
            enterKeyHint="done"
            placeholder="0"
            aria-label="Сумма"
            className={clsx(
              'w-full min-w-0 bg-transparent text-center text-[44px] leading-none font-semibold tracking-[-0.03em] tabular outline-none placeholder:text-fg-3/50',
              kind === 'income' && amountText && 'text-good',
            )}
            style={{ maxWidth: `${Math.max(2, amountText.length + 1)}ch` }}
          />
          <span className="text-[28px] font-medium text-fg-3">{cur}</span>
        </label>

        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                haptic.select()
                setCategory(category === c ? '' : c)
              }}
              className={clsx(
                'h-8 rounded-full px-3 text-[14px] font-medium transition-[background-color,color,transform] duration-150 active:scale-95',
                category === c ? 'bg-ink text-on-ink' : 'bg-surface-2 text-fg-2',
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder={categories.length ? 'Или другая категория' : 'Категория, например «Кафе»'}
          enterKeyHint="done"
          className="mt-3 h-11 w-full rounded-[12px] bg-surface-2 px-3.5 text-[16px] outline-none placeholder:text-fg-3 focus:ring-[3px] focus:ring-accent/15"
        />

        <Button
          type="submit"
          variant={kind === 'expense' ? 'primary' : 'accent'}
          loading={save.isPending}
          disabled={!amount}
          className="mt-4 h-12 w-full rounded-[12px] text-[16px]"
        >
          Записать {kind === 'expense' ? 'расход' : 'доход'}
        </Button>
      </form>

      <div className="grid grid-cols-2 gap-3">
        <MonthStat label="Расходы за месяц" value={summary?.expense} cur={cur} />
        <MonthStat label="Доходы за месяц" value={summary?.income} cur={cur} tone="good" />
      </div>

      {todays.length > 0 && (
        <Group title="Сегодня">
          {todays.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-[15px]">{t.category || (t.kind === 'income' ? 'Доход' : 'Без категории')}</span>
              <span className={clsx('shrink-0 text-[15px] font-medium tabular', t.kind === 'income' ? 'text-good' : 'text-fg')}>
                {t.kind === 'income' ? '+' : '−'}
                {money(Number(t.amount), cur, 2)}
              </span>
            </div>
          ))}
        </Group>
      )}
    </div>
  )
}

function MonthStat({ label, value, cur, tone }: { label: string; value: number | undefined; cur: string; tone?: 'good' }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface px-4 py-3">
      <div className="text-[12.5px] text-fg-3">{label}</div>
      {value == null ? (
        <Skeleton className="mt-1.5 h-6 w-24" />
      ) : (
        <div className={clsx('mt-0.5 text-[20px] font-semibold tracking-[-0.02em] tabular', tone === 'good' && value > 0 && 'text-good')}>
          {money(value, cur)}
        </div>
      )}
    </div>
  )
}
