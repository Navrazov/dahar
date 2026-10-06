import { useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, useList, useSettings, type StatementPreview, type StatementRow } from '@/shared/api'
import { fmtDate, money, plural } from '@/shared/lib'
import { Button, Empty, FieldLabel, Modal, Select, Spinner } from '@/shared/ui'

const banks: Record<StatementPreview['bank'], string> = { tbank: 'Т-Банк', sber: 'Сбер', csv: 'CSV' }

/** По названию счёта узнаём, подходит ли он к выписке. Для CSV другого банка подсказки нет. */
const bankNames: Record<StatementPreview['bank'], RegExp | null> = { tbank: /т-?банк|тинькофф|tinkoff|tbank/i, sber: /сбер|sber/i, csv: null }

const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Не удалось прочитать файл'))
    r.readAsDataURL(file)
  })

export function ImportStatementButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Загрузить выписку</Button>
      {open && <ImportStatement onClose={() => setOpen(false)} />}
    </>
  )
}

type Parsed = { preview: StatementPreview; data: string }

function ImportStatement({ onClose }: { onClose: () => void }) {
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [busy, setBusy] = useState(false)

  const switchAccount = async (accountId: number) => {
    if (!parsed) return
    setBusy(true)
    try {
      setParsed({ ...parsed, preview: await api.statementPreview(accountId, parsed.data) })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return parsed ? (
    <Review
      key={parsed.preview.account_id}
      preview={parsed.preview}
      switching={busy}
      onSwitch={switchAccount}
      onBack={() => setParsed(null)}
      onClose={onClose}
    />
  ) : (
    <Pick onParsed={setParsed} onClose={onClose} />
  )
}

function Pick({ onParsed, onClose }: { onParsed: (p: Parsed) => void; onClose: () => void }) {
  const settings = useSettings()
  const accounts = useList('accounts').filter((a) => !a.archived)
  const [accountId, setAccountId] = useState<string | null>(() => {
    const def = settings.default_account_id
    return def && accounts.some((a) => a.id === def) ? String(def) : accounts[0] ? String(accounts[0].id) : null
  })
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const parse = async (file: File | undefined) => {
    if (!file || !accountId) return
    setBusy(true)
    try {
      const data = await readFile(file)
      onParsed({ preview: await api.statementPreview(Number(accountId), data), data })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <Modal open onClose={onClose} title="Загрузить выписку" description="Операции из выписки попадут в выбранный счёт. Перед сохранением всё можно проверить">
      {!accounts.length ? (
        <Empty title="Сначала добавьте счёт" hint="Выписка записывается в конкретный счёт: например, «Т-Банк» или «Сбер»" />
      ) : (
        <div className="space-y-4">
          <FieldLabel label="Счёт">
            <Select value={accountId} onChange={setAccountId} options={accounts.map((a) => ({ value: String(a.id), label: a.name, dot: a.color }))} />
          </FieldLabel>
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              parse(e.dataTransfer.files[0])
            }}
            className={clsx(
              'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-line-strong px-4 py-9 text-center transition-colors hover:bg-hover',
              busy && 'pointer-events-none opacity-60',
            )}
          >
            <span className="flex items-center gap-2 text-[14px] font-medium">
              {busy && <Spinner />}
              {busy ? 'Читаю выписку…' : 'Выберите файл или перетащите сюда'}
            </span>
            <span className="text-[12.5px] text-fg-3">CSV или PDF, до 10 МБ</span>
            <input ref={input} type="file" accept=".csv,.pdf,text/csv,application/pdf" className="hidden" onChange={(e) => parse(e.target.files?.[0])} />
          </label>
          <div className="space-y-1.5 text-[12.5px] leading-relaxed text-fg-2">
            <p>
              <span className="font-medium text-fg">Т-Банк</span> — CSV. В приложении: счёт или карта → «Выписка» → период → формат CSV.
            </p>
            <p>
              <span className="font-medium text-fg">Сбер</span> — PDF. В приложении: карта → «Выписки и справки» → «Выписка по счёту».
            </p>
            <p>
              <span className="font-medium text-fg">Другой банк</span> — CSV с колонками «Дата», «Сумма» (или «Приход» и «Расход») и «Описание»: Альфа, ВТБ и
              большинство банков умеют такую выгрузку.
            </p>
            <p className="text-fg-3">
              Одну и ту же выписку можно загружать сколько угодно раз: уже загруженные операции не задвоятся. А ещё выписку можно просто переслать
              Telegram-боту.
            </p>
          </div>
        </div>
      )}
    </Modal>
  )
}

type Draft = StatementRow & { on: boolean; edited: string }

function Review({
  preview,
  switching,
  onSwitch,
  onBack,
  onClose,
}: {
  preview: StatementPreview
  switching: boolean
  onSwitch: (accountId: number) => void
  onBack: () => void
  onClose: () => void
}) {
  const cur = useSettings().currency || '₽'
  const qc = useQueryClient()
  const accounts = useList('accounts').filter((a) => !a.archived)
  const account = accounts.find((a) => a.id === preview.account_id)
  const looksLike = bankNames[preview.bank]
  const better = looksLike && account && !looksLike.test(account.name) ? accounts.find((a) => looksLike.test(a.name)) : undefined
  const txns = useList('transactions')
  const budgets = useList('budgets')
  const [rows, setRows] = useState<Draft[]>(() => preview.rows.map((r) => ({ ...r, on: !r.duplicate, edited: r.category })))
  const [currencyConfirmed, setCurrencyConfirmed] = useState(false)
  const currencyUnknown = rows.some((row) => !row.currency)
  const [showDupes, setShowDupes] = useState(false)
  const [busy, setBusy] = useState(false)

  const categories = useMemo(
    () =>
      [
        ...new Set([...txns.map((t) => t.category), ...budgets.map((b) => b.category), ...preview.rows.map((r) => r.category)].filter(Boolean)),
      ].sort() as string[],
    [txns, budgets, preview.rows],
  )
  const dupes = rows.filter((r) => r.duplicate).length
  const chosen = rows.filter((r) => r.on && !r.duplicate)
  const transfers = chosen.filter((r) => r.match).length
  const shown = showDupes ? rows : rows.filter((r) => !r.duplicate)
  const set = (key: string, patch: Partial<Draft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const save = async () => {
    setBusy(true)
    try {
      const res = await api.statementImport(
        preview.account_id,
        chosen.map((r) => ({
          key: r.key,
          currency: r.currency,
          proof: r.proof,
          date: r.date,
          kind: r.kind,
          amount: r.amount,
          description: r.description,
          category: r.edited.trim(),
          match_id: r.match?.id ?? null,
          learn: r.edited.trim() !== r.category,
        })),
        currencyConfirmed,
      )
      await qc.invalidateQueries()
      const parts = [`${res.created} ${plural(res.created, 'операция', 'операции', 'операций')}`]
      if (res.transfers) parts.push(`${res.transfers} ${plural(res.transfers, 'перевод', 'перевода', 'переводов')} между счетами`)
      toast.success(`Добавлено: ${parts.join(', ')}`)
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={880}
      title={`Выписка ${banks[preview.bank]} · счёт «${account?.name ?? ''}»`}
      description={
        <>
          {rows.length} {plural(rows.length, 'операция', 'операции', 'операций')}
          {dupes > 0 && `, ${dupes} уже ${plural(dupes, 'загружена', 'загружены', 'загружены')}`}
          {transfers > 0 && `, ${transfers} ${plural(transfers, 'похожа', 'похожи', 'похожи')} на перевод между вашими счетами`}. Категорию можно поправить: в
          следующий раз она подставится сама.
        </>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            Другой файл
          </Button>
          <div className="flex-1" />
          <Button variant="primary" loading={busy} disabled={!chosen.length || (currencyUnknown && !currencyConfirmed)} onClick={save}>
            {chosen.length ? `Сохранить ${chosen.length} ${plural(chosen.length, 'операцию', 'операции', 'операций')}` : 'Нечего сохранять'}
          </Button>
        </>
      }
    >
      {currencyUnknown ? (
        <label className="mb-4 flex items-start gap-2 rounded-lg bg-warn-soft p-3 text-sm">
          <input type="checkbox" checked={currencyConfirmed} onChange={(event) => setCurrencyConfirmed(event.target.checked)} />
          <span>В файле не указана валюта. Подтверждаю, что все суммы указаны в валюте учёта {cur}. Без этого операции не сохранятся.</span>
        </label>
      ) : (
        <p className="mb-3 text-xs text-fg-3">Валюта выписки: {[...new Set(rows.map((row) => row.currency))].join(', ')}</p>
      )}
      {better && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[8px] bg-warn-soft px-3.5 py-2.5 text-[13px]">
          <span>
            Похоже, это выписка {banks[preview.bank]}, а выбран счёт «{account?.name}».
          </span>
          <Button size="sm" disabled={switching} onClick={() => onSwitch(better.id)}>
            Записать в «{better.name}»
          </Button>
        </div>
      )}
      <datalist id="statement-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {!shown.length ? (
        <Empty title="Все операции из этой выписки уже загружены" />
      ) : (
        <div className="-mx-5 -mt-2">
          <div className="hidden grid-cols-[28px_96px_1fr_200px_110px] gap-3 px-5 py-2 text-[12px] font-medium text-fg-3 sm:grid">
            <span />
            <span>Дата</span>
            <span>Описание</span>
            <span className="px-2">Категория</span>
            <span className="text-right">Сумма</span>
          </div>
          {shown.map((r) => (
            <div
              key={r.key}
              className={clsx(
                'grid grid-cols-[28px_1fr_auto] items-center gap-x-3 gap-y-1 border-t border-line px-5 py-2.5 text-[13.5px] sm:grid-cols-[28px_96px_1fr_200px_110px]',
                (r.duplicate || !r.on) && 'opacity-45',
              )}
            >
              <input
                type="checkbox"
                aria-label="Сохранить операцию"
                checked={r.on && !r.duplicate}
                disabled={r.duplicate}
                onChange={() => set(r.key, { on: !r.on })}
                className="h-4 w-4 accent-[var(--ink)]"
              />
              <span className="hidden whitespace-nowrap text-fg-2 sm:block">
                {fmtDate(r.date, 'd MMM')}
                {r.time && <span className="ml-1 text-fg-3">{r.time}</span>}
              </span>
              <div className="min-w-0">
                <div className="truncate">{r.description || r.bank_category || '—'}</div>
                <div className="truncate text-[12px] text-fg-3">
                  <span className="sm:hidden">
                    {fmtDate(r.date, 'd MMM')}
                    {r.description && r.bank_category ? ' · ' : ''}
                  </span>
                  {r.description && r.bank_category}
                </div>
              </div>
              <div className="col-start-2 col-end-4 row-start-2 sm:col-auto sm:row-auto">
                {r.duplicate ? (
                  <span className="text-fg-3 sm:px-2">уже загружена</span>
                ) : r.match ? (
                  <span className="text-fg-2 sm:px-2">
                    Перевод {r.kind === 'expense' ? 'на' : 'с'} «{r.match.account_name}»
                  </span>
                ) : (
                  <input
                    list="statement-categories"
                    value={r.edited}
                    placeholder="Без категории"
                    onChange={(e) => set(r.key, { edited: e.target.value })}
                    className="-ml-2 h-8 w-[calc(100%+8px)] rounded-[6px] border border-transparent bg-transparent px-2 text-[13.5px] outline-none hover:border-line focus:border-line-strong focus:bg-surface sm:ml-0 sm:w-full"
                  />
                )}
              </div>
              <span
                className={clsx(
                  'col-start-3 row-start-1 text-right font-medium whitespace-nowrap tabular sm:col-auto sm:row-auto',
                  r.kind === 'income' && 'text-good',
                )}
              >
                {r.kind === 'income' ? '+' : '−'}
                {money(r.amount, cur, r.amount % 1 ? 2 : 0)}
              </span>
            </div>
          ))}
        </div>
      )}
      {dupes > 0 && (
        <button type="button" onClick={() => setShowDupes((v) => !v)} className="mt-3 text-[12.5px] text-fg-3 hover:text-fg">
          {showDupes ? 'Скрыть уже загруженные' : `Показать уже загруженные (${dupes})`}
        </button>
      )}
    </Modal>
  )
}
