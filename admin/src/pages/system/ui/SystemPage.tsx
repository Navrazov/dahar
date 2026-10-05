import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import { ago, bytes, dateTime, duration, num } from '@/shared/lib'
import { Badge, Card, CardHeader, KeyValue, MetricStrip, PageHeader, Table } from '@/shared/ui'
import { ChangePassword } from '@/features/auth'

const on = (v: boolean, yes = 'Включено', no = 'Выключено') => <Badge tone={v ? 'good' : 'gray'}>{v ? yes : no}</Badge>

export function SystemPage() {
  const { data: s } = useQuery({ queryKey: ['system'], queryFn: api.system, refetchInterval: 30_000 })
  if (!s) return null
  const schedulerOk = s.scheduler.lastTickAt && Date.now() - Date.parse(s.scheduler.lastTickAt) < 3 * 60_000

  return (
    <>
      <PageHeader title="Система" subtitle={`${s.app.name} ${s.app.version ?? ''} · Node ${s.node}`} />
      <MetricStrip
        className="mb-8"
        items={[
          { label: 'Работает', value: duration(s.uptime) },
          { label: 'Память процесса', value: bytes(s.memory.rss), sub: `куча ${bytes(s.memory.heap)}` },
          { label: 'База данных', value: bytes(s.database.size), sub: `PostgreSQL ${s.database.version.split(' ')[0]}` },
          {
            label: 'Миграции',
            value: s.migrations.applied.length,
            sub: s.migrations.pending.length ? `ожидают: ${s.migrations.pending.length}` : 'все применены',
            tone: s.migrations.pending.length ? 'bad' : null,
          },
        ]}
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="Таблицы" sub="по размеру" />
          <Table>
            <thead>
              <tr>
                <th>Таблица</th>
                <th className="!text-right">Строк ≈</th>
                <th className="!text-right">Размер</th>
              </tr>
            </thead>
            <tbody>
              {s.database.tables.map((t) => (
                <tr key={t.name}>
                  <td className="font-mono text-[12.5px]">{t.name}</td>
                  <td className="text-right tabular">{t.rows < 0 ? '—' : num(t.rows)}</td>
                  <td className="text-right text-fg-2 tabular">{bytes(t.size)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Сервисы" />
            <KeyValue
              items={[
                ['Telegram-бот', s.telegram.enabled ? <Badge tone="good">@{s.telegram.username ?? 'запускается'}</Badge> : on(false)],
                [
                  'Фоновые задачи',
                  <Badge tone={schedulerOk ? 'good' : 'bad'}>{schedulerOk ? `последний запуск ${ago(s.scheduler.lastTickAt)}` : 'не отвечают'}</Badge>,
                ],
                ['Sentry', on(s.sentry)],
                ['Хранилище файлов', s.storage],
                ['Часовой пояс сервера', s.timezone],
                ['База', <span className="font-mono text-[12px]">{s.database.label}</span>],
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Миграции" />
            <KeyValue
              items={s.migrations.applied.map((m) => [
                <span className="font-mono text-[12px]">{m.id}</span>,
                <span className="text-fg-2">{dateTime(m.applied_at)}</span>,
              ])}
            />
          </Card>
          <ChangePassword />
        </div>
      </div>
    </>
  )
}
