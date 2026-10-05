import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { api } from '@/shared/api'
import { ago, bytes, date, num, plural } from '@/shared/lib'
import { Badge, Card, Empty, Input, PageHeader, Segmented, Table } from '@/shared/ui'
import { CreateUser } from '@/features/manage-user'

type Filter = 'all' | 'active' | 'idle' | 'blocked'

const DAY = 86400_000

export function UsersPage() {
  const navigate = useNavigate()
  const { data = [] } = useQuery({ queryKey: ['users'], queryFn: api.users })
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const seen = (s: string | null) => (s ? Date.now() - Date.parse(s) : Infinity)
  const shown = data.filter((u) => {
    if (q && !`${u.login} ${u.name ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false
    if (filter === 'active') return seen(u.last_seen_at) < 7 * DAY
    if (filter === 'idle') return seen(u.last_seen_at) >= 30 * DAY
    if (filter === 'blocked') return !!u.blocked_at
    return true
  })

  return (
    <>
      <PageHeader title="Пользователи" subtitle={`${data.length} ${plural(data.length, 'аккаунт', 'аккаунта', 'аккаунтов')}`} actions={<CreateUser />} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Логин или имя" className="pl-9" />
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Все' },
            { value: 'active', label: 'Активны за неделю' },
            { value: 'idle', label: 'Пропали на месяц' },
            { value: 'blocked', label: 'Заблокированы' },
          ]}
        />
      </div>
      <Card>
        {!shown.length ? (
          <Empty title="Никого не нашлось" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Был в сети</th>
                <th className="!text-right">Дней за месяц</th>
                <th className="!text-right">Записей</th>
                <th className="!text-right">Файлы</th>
                <th>Создан</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id} onClick={() => navigate(`/users/${u.id}`)} className="cursor-pointer hover:bg-hover">
                  <td>
                    <div className="font-medium">{u.name || u.login}</div>
                    <div className="text-[12px] text-fg-3">@{u.login}</div>
                  </td>
                  <td className="whitespace-nowrap text-fg-2">{ago(u.last_seen_at)}</td>
                  <td className="text-right tabular">{u.active_days}</td>
                  <td className="text-right tabular">{num(u.records)}</td>
                  <td className="text-right text-fg-2 tabular">{bytes(u.files_size)}</td>
                  <td className="whitespace-nowrap text-fg-2">{date(u.created_at)}</td>
                  <td>
                    <div className="flex justify-end gap-1.5">
                      {u.telegram && <Badge>Telegram</Badge>}
                      {u.blocked_at && <Badge tone="bad">Заблокирован</Badge>}
                    </div>
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
