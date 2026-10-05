import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/shared/api'
import { dateTime, exportCsv, num, useDebouncedValue, tableOffset } from '@/shared/lib'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  controlCls,
  Empty,
  Input,
  MetricStrip,
  Modal,
  PageHeader,
  Pagination,
  QueryState,
  QueryToolbar,
  Segmented,
} from '@/shared/ui'
import { DailyBars } from '@/shared/ui/charts'

export function ErrorsPage() {
  const qc = useQueryClient(),
    [params, setParams] = useSearchParams()
  const source = params.get('source') || '',
    q = params.get('q') || '',
    days = params.get('days') || '30',
    offset = tableOffset(params.get('offset'))
  const search = useDebouncedValue(q)
  const [open, setOpen] = useState<number | null>(null),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false)
  const update = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams(params)
    next.set('offset', '0')
    for (const [k, v] of Object.entries(patch)) next.set(k, String(v))
    setParams(next, { replace: true })
    setOpen(null)
  }
  const query = useQuery({
    queryKey: ['errors', source, search, days, offset],
    queryFn: ({ signal }) => api.errors({ source, q: search, days, offset, limit: 50 }, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  })
  const clear = async () => {
    setBusy(true)
    try {
      const { removed } = await api.clearErrors()
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['errors'] }),
        qc.invalidateQueries({ queryKey: ['overview'] }),
        qc.invalidateQueries({ queryKey: ['audit'] }),
      ])
      toast.success(`Удалено записей: ${removed}`)
      setConfirm(false)
      update({ offset: 0 })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const { data } = query
  if (!data) return <QueryState query={query} title="Ошибки" table />
  const csv = () =>
    exportCsv('dahar-errors-page.csv', [
      ['ID', 'Источник', 'Сообщение', 'Дата', 'Пользователь'],
      ...data.items.map((e) => [e.id, e.source, e.message, e.created_at, e.user]),
    ])
  return (
    <div className="content-enter">
      <PageHeader
        title="Ошибки"
        subtitle="Ошибки сервера и браузера. Хранятся 30 дней."
        actions={
          <>
            <Button onClick={csv} disabled={query.isFetching || !data.items.length}>
              CSV страницы
            </Button>
            <Button variant="danger" onClick={() => setConfirm(true)}>
              Очистить журнал
            </Button>
          </>
        }
      />
      <QueryToolbar query={query} />
      <MetricStrip
        className="mb-5"
        items={[
          { label: 'Всего по фильтру', value: num(data.total) },
          { label: 'Сервер', value: num(data.server), tone: data.server ? 'bad' : null },
          { label: 'Браузер', value: num(data.client) },
          { label: 'Затронуты пользователи', value: num(data.affected) },
        ]}
      />
      <Card className="mb-5">
        <CardHeader title="Ошибок в день" sub={`${days === '1' ? 'Сегодня' : `${days} календарных дней`} · текущий фильтр`} />
        <div className="px-2 pb-3">
          <DailyBars data={data.daily} name="Ошибок" color="var(--s8)" height={160} />
        </div>
      </Card>
      {!!data.groups.length && (
        <Card className="mb-5">
          <CardHeader title="Частые ошибки" sub="по текущему фильтру" />
          <div className="divide-y divide-line">
            {data.groups.map((g) => (
              <button
                key={g.source + g.message}
                onClick={() => update({ q: g.message, source: g.source })}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-hover"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px]">{g.message}</span>
                  <span className="text-[12px] text-fg-3">
                    {g.source === 'server' ? 'Сервер' : 'Браузер'} · последняя {dateTime(g.last_at)}
                  </span>
                </span>
                <Badge tone="bad">{g.count}</Badge>
              </button>
            ))}
          </div>
        </Card>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input aria-label="Поиск ошибок" placeholder="Сообщение или логин" value={q} onChange={(e) => update({ q: e.target.value })} className="sm:max-w-72" />
        <select aria-label="Период ошибок" className={controlCls + ' sm:!w-auto'} value={days} onChange={(e) => update({ days: e.target.value })}>
          <option value="1">Сегодня</option>
          <option value="7">7 дней</option>
          <option value="30">30 дней</option>
        </select>
        <Segmented
          value={source}
          onChange={(source) => update({ source })}
          options={[
            { value: '', label: 'Все' },
            { value: 'server', label: 'Сервер' },
            { value: 'client', label: 'Браузер' },
          ]}
        />
        {(q || source || days !== '30') && <Button onClick={() => setParams({}, { replace: true })}>Сбросить фильтры</Button>}
      </div>
      <Card aria-busy={query.isFetching}>
        {!data.items.length ? (
          <Empty title="Ошибок по фильтру нет" />
        ) : (
          <div className="divide-y divide-line">
            {data.items.map((e) => (
              <div key={e.id}>
                <button
                  type="button"
                  aria-expanded={open === e.id}
                  onClick={() => setOpen(open === e.id ? null : e.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-hover"
                >
                  <Badge tone={e.source === 'server' ? 'bad' : 'warn'}>{e.source === 'server' ? 'Сервер' : 'Браузер'}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px]">{e.message}</div>
                    <div className="mt-0.5 break-words text-[12px] text-fg-3">
                      #{e.id} · {dateTime(e.created_at)}
                      {e.user && ` · @${e.user}`}
                      {typeof e.context?.path === 'string' && ` · ${e.context.method ?? ''} ${e.context.path}`}
                      {typeof e.context?.url === 'string' && ` · ${e.context.url}`}
                    </div>
                  </div>
                </button>
                {open === e.id && (
                  <pre className="border-t border-line bg-surface-2 px-4 py-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words text-fg-2">
                    {e.stack || 'Стек не сохранён'}
                    {e.context ? `\n\n${JSON.stringify(e.context, null, 2)}` : ''}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
        <Pagination total={data.total} offset={offset} limit={50} busy={query.isFetching} onChange={(offset) => update({ offset })} />
      </Card>
      <Modal
        open={confirm}
        onClose={() => !busy && setConfirm(false)}
        title="Очистить весь журнал ошибок?"
        footer={
          <>
            <Button disabled={busy} onClick={() => setConfirm(false)}>
              Отмена
            </Button>
            <Button variant="danger" loading={busy} onClick={clear}>
              Очистить всё
            </Button>
          </>
        }
      >
        <p className="text-[14px]">
          Будут удалены все сохранённые ошибки, включая скрытые текущим фильтром. Действие попадёт в журнал администратора. Перед очисткой можно скачать текущую
          страницу CSV.
        </p>
      </Modal>
    </div>
  )
}
