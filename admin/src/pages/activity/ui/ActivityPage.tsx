import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import { shortDay } from '@/shared/lib'
import { Card, CardHeader, Empty, QueryState, QueryToolbar, PageHeader, Table } from '@/shared/ui'

function cellStyle(share: number | null) {
  if (share == null) return undefined
  return { background: `color-mix(in srgb, var(--s3) ${Math.round(12 + share * 70)}%, var(--surface))`, color: share > 0.55 ? 'white' : undefined }
}

export function ActivityPage() {
  const query = useQuery({ queryKey: ['retention'], queryFn: api.retention })
  const { data } = query
  if (!data) return <QueryState query={query} title="Активность" />
  const maxWeeks = Math.max(1, ...data.cohorts.map((c) => c.weeks.findLastIndex((w) => w != null) + 1))

  return (
    <div className="content-enter">
      <PageHeader title="Активность" subtitle="Возвращаются ли люди после регистрации. Строка — неделя регистрации, столбец — сколько недель прошло." />
      <QueryToolbar query={query} />
      <Card className="mb-5">
        <CardHeader title="Удержание по неделям" sub="12 недель · текущая неделя ещё не завершена" />
        {!data.cohorts.length ? (
          <Empty title="За 12 недель регистраций не было" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Неделя регистрации</th>
                <th className="!text-right">Людей</th>
                {Array.from({ length: maxWeeks }, (_, w) => (
                  <th key={w} className="!text-center">
                    {w === 0 ? 'Первая' : `+${w}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.cohorts.map((c) => (
                <tr key={c.cohort}>
                  <td className="whitespace-nowrap">с {shortDay(c.cohort)}</td>
                  <td className="text-right tabular">{c.size}</td>
                  {c.weeks.slice(0, maxWeeks).map((users, w) => {
                    const share = users == null ? null : users / c.size
                    return (
                      <td key={w} className="!px-1 text-center tabular">
                        {share == null ? (
                          <span className="text-fg-3" title="Эта неделя ещё не наступила">
                            —
                          </span>
                        ) : (
                          <span className="inline-block w-full rounded-[5px] py-1 text-[12.5px]" style={cellStyle(share)} title={`${users} из ${c.size}`}>
                            {Math.round(share * 100)}%
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Самые активные" sub="дней с заходом за 30 дней" />
        {!data.top.length ? (
          <Empty title="Пока никто не заходил" />
        ) : (
          <div className="divide-y divide-line">
            {data.top.map((u) => (
              <Link key={u.id} to={`/users/${u.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-hover">
                <span className="truncate text-[14px]">
                  {u.name || u.login} <span className="text-fg-3">@{u.login}</span>
                </span>
                <span className="text-[13.5px] tabular">{u.days}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
