import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { api } from '@/shared/api'
import { ago, bytes, date, exportCsv, num, useDebouncedValue, tableOffset } from '@/shared/lib'
import { Badge, Button, Card, controlCls, Empty, Input, MetricStrip, PageHeader, Pagination, QueryState, QueryToolbar, Segmented, Table } from '@/shared/ui'
import { CreateUser } from '@/features/manage-user'

export function UsersPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || '',
    filter = params.get('filter') || 'all',
    sort = params.get('sort') || 'newest'
  const offset = tableOffset(params.get('offset')),
    search = useDebouncedValue(q)
  const update = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams(params)
    next.set('offset', '0')
    for (const [k, v] of Object.entries(patch)) next.set(k, String(v))
    setParams(next, { replace: true })
  }
  const query = useQuery({
    queryKey: ['users', search, filter, sort, offset],
    queryFn: ({ signal }) => api.users({ q: search, filter, sort, offset, limit: 50 }, signal),
    placeholderData: keepPreviousData,
  })
  const { data } = query
  if (!data) return <QueryState query={query} title="Пользователи" table />
  const s = data.summary
  const csv = () =>
    exportCsv('dahar-users-page.csv', [
      ['ID', 'Логин', 'Имя', 'Создан', 'Последний визит', 'Заблокирован', 'Telegram', '2FA', 'Активных дней', 'Записей', 'Сессий', 'Размер файлов'],
      ...data.items.map((u) => [
        u.id,
        u.login,
        u.name,
        u.created_at,
        u.last_seen_at,
        !!u.blocked_at,
        u.telegram,
        u.two_factor,
        u.active_days,
        u.records,
        u.sessions,
        u.files_size,
      ]),
    ])
  return (
    <div className="content-enter">
      <PageHeader
        title="Пользователи"
        subtitle={`${num(s.total)} аккаунтов · найдено ${num(data.total)}`}
        actions={
          <>
            <Button icon={Download} onClick={csv} disabled={query.isFetching || !data.items.length}>
              CSV страницы
            </Button>
            <CreateUser />
          </>
        }
      />
      <QueryToolbar query={query} />
      <MetricStrip
        className="mb-5"
        items={[
          { label: 'Активны за неделю', value: s.active },
          { label: 'Без визитов 30 дней', value: s.idle },
          { label: 'Заблокированы', value: s.blocked },
          { label: 'С Telegram', value: s.telegram },
          { label: 'С защитой 2FA', value: s.secure },
        ]}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => update({ q: e.target.value })} placeholder="Логин или имя" aria-label="Поиск пользователей" className="sm:max-w-64" />
        <select aria-label="Сортировка пользователей" value={sort} onChange={(e) => update({ sort: e.target.value })} className={controlCls + ' sm:!w-auto'}>
          <option value="newest">Сначала новые</option>
          <option value="oldest">Сначала старые</option>
          <option value="seen">Последние визиты</option>
          <option value="login">По логину</option>
        </select>
        <div className="max-w-full overflow-x-auto">
          <Segmented
            value={filter}
            onChange={(v) => update({ filter: v })}
            options={[
              { value: 'all', label: 'Все' },
              { value: 'active', label: 'Активные' },
              { value: 'idle', label: 'Неактивные' },
              { value: 'blocked', label: 'Блокировки' },
              { value: 'telegram', label: 'Telegram' },
              { value: 'secure', label: '2FA' },
            ]}
          />
        </div>
      </div>
      <Card aria-busy={query.isFetching}>
        {!data.items.length ? (
          <Empty title="Никого не нашлось" hint="Попробуйте другой поиск или фильтр" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Был в сети</th>
                <th>Дней / 30</th>
                <th>Записей</th>
                <th>Сессий</th>
                <th>Файлы</th>
                <th>Создан</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id} className="hover:bg-hover">
                  <td>
                    <Link to={`/users/${u.id}`} className="block font-medium text-accent-text hover:underline">
                      {u.name || u.login}
                      <span className="block text-[12px] font-normal text-fg-3">@{u.login}</span>
                    </Link>
                  </td>
                  <td className="whitespace-nowrap text-fg-2">{ago(u.last_seen_at)}</td>
                  <td className="tabular">{u.active_days}</td>
                  <td className="tabular">{num(u.records)}</td>
                  <td className="tabular">{u.sessions}</td>
                  <td className="whitespace-nowrap tabular">{bytes(u.files_size)}</td>
                  <td className="whitespace-nowrap text-fg-2">{date(u.created_at)}</td>
                  <td>
                    <div className="flex gap-1.5">
                      {u.telegram && <Badge>Telegram</Badge>}
                      {u.two_factor && <Badge tone="good">2FA</Badge>}
                      {u.blocked_at && <Badge tone="bad">Заблокирован</Badge>}
                    </div>
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
