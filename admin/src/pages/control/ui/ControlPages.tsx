import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, type Page } from '@/shared/api'
import { ago, dateTime, exportCsv, num, tableOffset, useDebouncedValue } from '@/shared/lib'
import { Badge, Button, Card, controlCls, Empty, Input, MetricStrip, PageHeader, Pagination, QueryState, QueryToolbar, Table } from '@/shared/ui'

const subscriptionLabels: Record<string, string> = { active: 'Активна', trial: 'Пробный период', expired: 'Истекла', pilot: 'Пилот' }
const paymentLabels: Record<string, string> = {
  pending: 'Ожидает',
  succeeded: 'Оплачен',
  failed: 'Ошибка',
  canceled: 'Отменён',
  refunded: 'Возвращён',
  partially_refunded: 'Частичный возврат',
}
const aiLabels: Record<string, string> = { done: 'Готово', failed: 'Ошибка', pending: 'В работе' }
const amount = (value: string | number | null, currency = 'RUB') =>
  value == null ? '—' : new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: currency === 'USD' ? 4 : 2 }).format(Number(value))
const user = (r: { user_id: number | null; login: string | null; name: string | null }) =>
  r.user_id ? (
    <Link className="text-accent-text hover:underline" to={`/users/${r.user_id}`}>
      {r.name || r.login}
      <span className="block text-xs text-fg-3">@{r.login}</span>
    </Link>
  ) : (
    <span className="text-fg-3">Аккаунт удалён</span>
  )
const status = (value: string, labels: Record<string, string>) => (
  <Badge tone={['active', 'succeeded', 'done', 'delivered'].includes(value) ? 'good' : ['expired', 'failed'].includes(value) ? 'bad' : 'gray'}>
    {labels[value] ?? value}
  </Badge>
)

type Filters = { key: string; label: string; options: { value: string; label: string }[] }[]
type Column<T> = { title: string; cell: (row: T) => ReactNode }
function Registry<D extends Page<object>>({
  title,
  subtitle,
  queryKey,
  load,
  columns,
  filters = [],
  summary,
  notice,
}: {
  title: string
  subtitle: string
  queryKey: string
  load: (params: Record<string, string | number>, signal?: AbortSignal) => Promise<D>
  columns: Column<D['items'][number]>[]
  filters?: Filters
  summary?: (data: D) => ReactNode
  notice?: ReactNode
}) {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || '',
    search = useDebouncedValue(q),
    offset = tableOffset(params.get('offset'))
  const queryParams: Record<string, string | number> = { q: search, offset, limit: 50 }
  filters.forEach((f) => {
    queryParams[f.key] = params.get(f.key) || f.options[0].value
  })
  if (params.get('user_id')) queryParams.user_id = params.get('user_id')!
  const update = (key: string, value: string | number) => {
    const next = new URLSearchParams(params)
    next.set('offset', '0')
    next.set(key, String(value))
    setParams(next, { replace: true })
  }
  const query = useQuery({
    queryKey: [queryKey, queryParams],
    queryFn: ({ signal }) => load(queryParams, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  })
  const { data } = query
  if (!data) return <QueryState query={query} title={title} table />
  const csv = () => {
    if (!data.items.length) return
    const keys = Object.keys(data.items[0])
    exportCsv(`dahar-${queryKey}-page.csv`, [keys.map(String), ...data.items.map((r) => keys.map((k) => (r as Record<string, unknown>)[k]))])
  }
  return (
    <div className="content-enter">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <Button onClick={csv} disabled={query.isFetching || !data.items.length}>
            CSV страницы
          </Button>
        }
      />
      <QueryToolbar query={query} />
      {notice && <div className="mb-5 rounded-lg border border-line bg-surface-2 p-4 text-sm text-fg-2">{notice}</div>}
      {summary?.(data)}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input aria-label="Поиск по пользователю" placeholder="Логин или имя" value={q} onChange={(e) => update('q', e.target.value)} className="sm:max-w-64" />
        {filters.map((f) => (
          <select
            key={f.key}
            aria-label={f.label}
            className={controlCls + ' sm:!w-auto'}
            value={String(queryParams[f.key])}
            onChange={(e) => update(f.key, e.target.value)}
          >
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}
        {params.get('user_id') && (
          <Button
            onClick={() => {
              const next = new URLSearchParams(params)
              next.delete('user_id')
              next.set('offset', '0')
              setParams(next)
            }}
          >
            Все пользователи (сейчас ID {params.get('user_id')})
          </Button>
        )}
        <span className="text-sm text-fg-3">Найдено {num(data.total)}</span>
      </div>
      <Card aria-busy={query.isFetching}>
        {!data.items.length ? (
          <Empty title="Записей пока нет" hint="В выбранном фильтре нет данных" />
        ) : (
          <Table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.title}>{c.title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((r, i) => (
                <tr key={i} className="hover:bg-hover">
                  {columns.map((c) => (
                    <td key={c.title}>{c.cell(r)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination total={data.total} offset={offset} limit={50} busy={query.isFetching} onChange={(v) => update('offset', v)} />
      </Card>
    </div>
  )
}

export function SubscriptionsPage() {
  return (
    <Registry
      title="Подписки"
      subtitle="Все аккаунты: оплаченный доступ, пробный период, истёкший срок и пилот."
      queryKey="subscriptions"
      load={api.subscriptions}
      notice="Приём платежей ещё не подключён. Статусы определяются по серверным датам; истёкший срок пока не ограничивает доступ пилота. Оплаченный срок сам по себе не доказывает получение денег — проверьте журнал платежей."
      filters={[
        {
          key: 'status',
          label: 'Статус подписки',
          options: [{ value: 'all', label: 'Все статусы' }, ...Object.entries(subscriptionLabels).map(([value, label]) => ({ value, label }))],
        },
        {
          key: 'canceling',
          label: 'Продление',
          options: [
            { value: 'all', label: 'Все продления' },
            { value: '1', label: 'Отмена в конце периода' },
          ],
        },
      ]}
      summary={(d) => (
        <MetricStrip
          className="mb-5"
          items={[
            { label: 'Активны', value: d.summary.active },
            { label: 'Пробный период', value: d.summary.trial },
            { label: 'Истекли', value: d.summary.expired },
            { label: 'Пилот', value: d.summary.pilot },
            { label: 'Отмена в конце', value: d.summary.canceling },
          ]}
        />
      )}
      columns={[
        { title: 'Пользователь', cell: (r) => user(r) },
        {
          title: 'Статус',
          cell: (r) => (
            <>
              {status(r.status, subscriptionLabels)}
              {r.blocked_at && <Badge tone="bad">Заблокирован</Badge>}
            </>
          ),
        },
        { title: 'Trial до', cell: (r) => dateTime(r.trial_ends_at) },
        { title: 'Оплачено до', cell: (r) => dateTime(r.paid_until) },
        { title: 'Продление', cell: (r) => (r.paid_until ? (r.cancel_at_period_end ? 'Отмена в конце' : 'Запрошено') : '—') },
        {
          title: 'Платежи',
          cell: (r) => (
            <Link to={`/payments?user_id=${r.user_id}`} className="text-accent-text hover:underline">
              {r.paid_payments} оплаченных →
            </Link>
          ),
        },
      ]}
    />
  )
}
export function PaymentsPage() {
  return (
    <Registry
      title="Платежи"
      subtitle="Журнал платежей за подписку Dahar. Личные финансовые операции пользователей сюда не входят."
      queryKey="payments"
      load={api.payments}
      notice="Платёжный провайдер пока не подключён, поэтому новые платежи автоматически не поступают. Журнал готов для интеграции. Суммы показаны отдельно по валютам; выручка учитывает только оплаченные записи за вычетом возвратов и не включает комиссии."
      filters={[
        {
          key: 'status',
          label: 'Статус платежа',
          options: [{ value: 'all', label: 'Все статусы' }, ...Object.entries(paymentLabels).map(([value, label]) => ({ value, label }))],
        },
        {
          key: 'days',
          label: 'Период платежей',
          options: [
            { value: 'all', label: 'За всё время' },
            { value: '7', label: 'За 7 дней' },
            { value: '30', label: 'За 30 дней' },
            { value: '90', label: 'За 90 дней' },
          ],
        },
      ]}
      summary={(d) => (
        <div className="mb-5 space-y-3">
          {d.money.map((m) => (
            <MetricStrip
              key={m.currency}
              items={[
                { label: `Получено · ${m.currency}`, value: amount(m.gross, m.currency) },
                { label: 'Возвращено', value: amount(m.refunded, m.currency) },
                { label: 'После возвратов', value: amount(m.net, m.currency) },
              ]}
            />
          ))}
          <p className="text-sm text-fg-3">{d.statuses.map((s) => `${paymentLabels[s.status] || s.status}: ${s.count}`).join(' · ') || 'Платежей ещё нет'}</p>
        </div>
      )}
      columns={[
        {
          title: 'ID / провайдер',
          cell: (r) => (
            <span className="block max-w-52 break-all text-xs">
              #{r.id} · {r.provider}
              <br />
              {r.provider_payment_id}
            </span>
          ),
        },
        { title: 'Пользователь', cell: (r) => user(r) },
        { title: 'Статус', cell: (r) => status(r.status, paymentLabels) },
        { title: 'План', cell: (r) => (r.plan === 'yearly' ? 'Год' : r.plan === 'monthly' ? 'Месяц' : '—') },
        { title: 'Сумма', cell: (r) => amount(r.amount, r.currency) },
        { title: 'Возврат', cell: (r) => amount(r.refunded_amount, r.currency) },
        {
          title: 'Создан / оплачен',
          cell: (r) => (
            <span className="whitespace-nowrap">
              {dateTime(r.created_at)}
              <br />
              <span className="text-fg-3">{dateTime(r.paid_at)}</span>
            </span>
          ),
        },
      ]}
    />
  )
}
export function TelegramPage() {
  return (
    <Registry
      title="Telegram"
      subtitle="Все текущие подключения бота и использование мини-приложения."
      queryKey="telegram"
      load={api.telegram}
      notice="Посещения Mini App учитываются с установки этой версии. Дата первого подключения может отсутствовать у старых аккаунтов. Журнал доставок хранится 30 дней."
      filters={[
        {
          key: 'filter',
          label: 'Подключения Telegram',
          options: [
            { value: 'all', label: 'Все подключения' },
            { value: 'miniapp', label: 'Открывали Mini App' },
            { value: 'failed', label: 'Есть сбои доставки' },
          ],
        },
      ]}
      summary={(d) => (
        <MetricStrip
          className="mb-5"
          items={[
            { label: 'Подключили', value: d.summary.linked },
            { label: 'Открывали Mini App', value: d.summary.miniapp },
            { label: 'Mini App за неделю', value: d.summary.miniapp7 },
            { label: 'Со сбоями доставки', value: d.summary.affected },
          ]}
        />
      )}
      columns={[
        { title: 'Пользователь', cell: (r) => user(r) },
        { title: 'Telegram ID', cell: (r) => r.chat_id },
        { title: 'Первое подключение', cell: (r) => dateTime(r.linked_at) },
        { title: 'Mini App', cell: (r) => ago(r.last_miniapp_at) },
        { title: 'Последняя доставка', cell: (r) => dateTime(r.last_delivered_at) },
        {
          title: 'Сбои',
          cell: (r) => (
            <Link className="text-accent-text hover:underline" to={`/deliveries?user_id=${r.user_id}&channel=telegram`}>
              {r.failed} →
            </Link>
          ),
        },
        { title: 'Аккаунт', cell: (r) => <Badge tone={r.blocked_at ? 'bad' : 'good'}>{r.blocked_at ? 'Заблокирован' : 'Доступен'}</Badge> },
      ]}
    />
  )
}
export function DeliveriesPage() {
  return (
    <Registry
      title="Доставки"
      subtitle="Telegram и Web Push: подтверждения, ожидающие повторы и исчерпанные попытки. Хранятся 30 дней."
      queryKey="deliveries"
      load={api.deliveries}
      filters={[
        {
          key: 'channel',
          label: 'Канал доставки',
          options: [
            { value: 'all', label: 'Все каналы' },
            { value: 'telegram', label: 'Telegram' },
            { value: 'push', label: 'Web Push' },
          ],
        },
        {
          key: 'status',
          label: 'Статус доставки',
          options: [
            { value: 'all', label: 'Все доставки' },
            { value: 'failed', label: 'Исчерпаны попытки' },
            { value: 'pending', label: 'Ожидают' },
            { value: 'delivered', label: 'Доставлены' },
          ],
        },
      ]}
      columns={[
        { title: 'Пользователь', cell: (r) => user(r) },
        {
          title: 'Канал',
          cell: (r) =>
            r.channel.startsWith('push-device:') ? `Push · устройство ${r.channel.split(':')[1]}` : r.channel === 'push' ? 'Push · общая доставка' : 'Telegram',
        },
        {
          title: 'Статус',
          cell: (r) =>
            status(r.delivered_at ? 'delivered' : r.attempts >= 5 ? 'failed' : 'pending', {
              delivered: 'Доставлено',
              failed: 'Исчерпаны попытки',
              pending: 'Ожидает',
            }),
        },
        { title: 'Попытки', cell: (r) => r.attempts },
        { title: 'Доставка / повтор', cell: (r) => dateTime(r.delivered_at || r.next_attempt_at) },
        { title: 'Последняя ошибка', cell: (r) => <span className="block max-w-80 break-words text-sm">{r.last_error || '—'}</span> },
        { title: 'Ключ', cell: (r) => <span className="block max-w-52 break-all text-xs text-fg-3">{r.key}</span> },
      ]}
    />
  )
}
export function AiPage() {
  return (
    <Registry
      title="AI и расходы"
      subtitle="Генерации за 30 дней без текстов запросов и ответов."
      queryKey="ai-runs"
      load={api.aiRuns}
      notice="Известная стоимость учитывает только ответы с настроенными ставками для точной модели. Запросы без цены показаны отдельно: их стоимость неизвестна, а не равна нулю. Итоговый счёт поставщика может включать дополнительные попытки и другие расходы."
      filters={[
        {
          key: 'status',
          label: 'Статус AI',
          options: [{ value: 'all', label: 'Все генерации' }, ...Object.entries(aiLabels).map(([value, label]) => ({ value, label }))],
        },
      ]}
      summary={(d) => (
        <MetricStrip
          className="mb-5"
          items={[
            { label: 'Запросов', value: d.summary.requests },
            { label: 'Сбоев', value: d.summary.failed },
            { label: 'Стоимость известна', value: amount(d.summary.known_cost_usd, 'USD') },
            { label: 'Готовых без цены', value: d.summary.unpriced },
            { label: 'Токены вход / выход', value: `${num(Number(d.summary.input_tokens))} / ${num(Number(d.summary.output_tokens))}` },
          ]}
        />
      )}
      columns={[
        { title: 'Пользователь', cell: (r) => user(r) },
        { title: 'Неделя', cell: (r) => r.week_start.slice(0, 10) },
        { title: 'Статус', cell: (r) => status(r.status, aiLabels) },
        { title: 'Ошибка', cell: (r) => <span className="block max-w-64 break-words text-sm">{r.last_error || '—'}</span> },
        { title: 'Модель', cell: (r) => <span className="break-all">{r.model || '—'}</span> },
        { title: 'Токены', cell: (r) => `${num(r.input_tokens)} / ${num(r.output_tokens)}` },
        { title: 'USD', cell: (r) => (r.cost_usd == null ? 'Неизвестно' : amount(r.cost_usd, 'USD')) },
        { title: 'Время', cell: (r) => (r.duration_ms == null ? '—' : `${(r.duration_ms / 1000).toFixed(1)} с`) },
        { title: 'Создан', cell: (r) => dateTime(r.created_at) },
      ]}
    />
  )
}
