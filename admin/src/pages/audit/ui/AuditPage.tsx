import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import { auditLabels, dateTime, exportCsv, useDebouncedValue, tableOffset } from '@/shared/lib'
import { Button, Card, controlCls, Empty, Input, PageHeader, Pagination, QueryState, QueryToolbar, Table } from '@/shared/ui'

export function AuditPage() {
  const [params, setParams] = useSearchParams(),
    [open, setOpen] = useState<number | null>(null)
  const q = params.get('q') || '',
    action = params.get('action') || '',
    offset = tableOffset(params.get('offset')),
    search = useDebouncedValue(q)
  const update = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams(params)
    next.set('offset', '0')
    for (const [k, v] of Object.entries(patch)) next.set(k, String(v))
    setParams(next, { replace: true })
  }
  const query = useQuery({
    queryKey: ['audit', search, action, offset],
    queryFn: ({ signal }) => api.audit({ q: search, action, offset, limit: 50 }, signal),
    placeholderData: keepPreviousData,
  })
  const { data } = query
  if (!data) return <QueryState query={query} title="Журнал действий" table />
  const csv = () =>
    exportCsv('dahar-audit-page.csv', [
      ['ID', 'Дата', 'Действие', 'Пользователь', 'Администратор', 'IP', 'Детали'],
      ...data.items.map((a) => [a.id, a.created_at, a.action, a.target, a.admin, a.ip, JSON.stringify(a.meta)]),
    ])
  return (
    <div className="content-enter">
      <PageHeader
        title="Журнал действий"
        subtitle={`Найдено ${data.total} действий · входы, изменения аккаунтов и служебные операции`}
        actions={
          <Button onClick={csv} disabled={query.isFetching || !data.items.length}>
            CSV страницы
          </Button>
        }
      />
      <QueryToolbar query={query} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          value={q}
          onChange={(e) => update({ q: e.target.value })}
          aria-label="Поиск действий"
          placeholder="Пользователь или администратор"
          className="sm:max-w-72"
        />
        <select className={controlCls + ' sm:!w-auto'} aria-label="Тип действия" value={action} onChange={(e) => update({ action: e.target.value })}>
          <option value="">Все действия</option>
          {data.actions.map((a) => (
            <option key={a.action} value={a.action}>
              {auditLabels[a.action] ?? a.action} · {a.total}
            </option>
          ))}
        </select>
      </div>
      <Card aria-busy={query.isFetching}>
        {!data.items.length ? (
          <Empty title="Действий по фильтру нет" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Когда</th>
                <th>Действие</th>
                <th>Кого касается</th>
                <th>Кто</th>
                <th>IP</th>
                <th>Детали</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap text-fg-2">
                    {dateTime(a.created_at)}
                    <span className="block text-[11px] text-fg-3">#{a.id}</span>
                  </td>
                  <td>{auditLabels[a.action] ?? a.action}</td>
                  <td>{a.target ? `@${a.target}` : '—'}</td>
                  <td className="text-fg-2">{a.admin ?? '—'}</td>
                  <td className="text-fg-3 tabular">{a.ip ?? '—'}</td>
                  <td>
                    {a.meta ? (
                      <>
                        <Button aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>
                          Детали
                        </Button>
                        {open === a.id && (
                          <pre className="mt-2 max-w-64 font-mono text-[12px] whitespace-pre-wrap break-words">{JSON.stringify(a.meta, null, 2)}</pre>
                        )}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination total={data.total} offset={offset} limit={50} busy={query.isFetching} onChange={(offset) => update({ offset })} />
      </Card>
    </div>
  )
}
