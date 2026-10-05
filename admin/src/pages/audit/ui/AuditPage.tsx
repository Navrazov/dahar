import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import { auditLabels, dateTime } from '@/shared/lib'
import { Card, Empty, PageHeader, Table } from '@/shared/ui'

export function AuditPage() {
  const { data = [] } = useQuery({ queryKey: ['audit'], queryFn: api.audit })
  return (
    <>
      <PageHeader title="Журнал действий" subtitle="Всё, что делалось в админке: входы, создание и блокировка пользователей, сброс паролей." />
      <Card>
        {!data.length ? (
          <Empty title="Журнал пуст" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Когда</th>
                <th>Действие</th>
                <th>Кого касается</th>
                <th>Кто</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap text-fg-2">{dateTime(a.created_at)}</td>
                  <td>{auditLabels[a.action] ?? a.action}</td>
                  <td>{a.target ? `@${a.target}` : '—'}</td>
                  <td className="text-fg-2">{a.admin ?? '—'}</td>
                  <td className="text-fg-3 tabular">{a.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}
