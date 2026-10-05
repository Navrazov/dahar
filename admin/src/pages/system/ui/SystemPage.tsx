import { OperationsPanel } from '@/widgets/operations'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import { ago, bytes, dateTime, duration, num } from '@/shared/lib'
import { Badge, Card, CardHeader, KeyValue, MetricStrip, QueryState, QueryToolbar, PageHeader, Input, Table } from '@/shared/ui'
import { ChangePassword } from '@/features/auth'

const on = (v: boolean, yes = 'Включено', no = 'Выключено') => <Badge tone={v ? 'good' : 'gray'}>{v ? yes : no}</Badge>

export function SystemPage() {
  const [tableSearch, setTableSearch] = useState('')
  const query = useQuery({ queryKey: ['system'], queryFn: api.system, refetchInterval: 30_000 })
  const { data: s } = query
  if (!s) return <QueryState query={query} title="Система" />
  const schedulerOk = s.scheduler.lastTickAt && Date.now() - Date.parse(s.scheduler.lastTickAt) < 3 * 60_000

  return (
    <div className="content-enter">
      <PageHeader title="Система" subtitle={`${s.app.name} ${s.app.version ?? ''} · Node ${s.node}`} />
      <QueryToolbar query={query} />
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
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader
            title="Таблицы"
            sub="по размеру"
            action={
              <Input
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                aria-label="Найти таблицу"
                placeholder="Название таблицы"
                className="!w-44"
              />
            }
          />
          <Table maxHeight={560}>
            <thead>
              <tr>
                <th>Таблица</th>
                <th className="!text-right">Строк ≈</th>
                <th className="!text-right">Размер</th>
                <th className="!text-right">Индексы</th>
                <th className="!text-right">Мёртвых строк ≈</th>
                <th>Анализ</th>
              </tr>
            </thead>
            <tbody>
              {s.database.tables
                .filter((t) => t.name.includes(tableSearch.trim().toLowerCase()))
                .map((t) => (
                  <tr key={t.name}>
                    <td className="font-mono text-[12.5px]">{t.name}</td>
                    <td className="text-right tabular">{t.rows < 0 ? '—' : num(t.rows)}</td>
                    <td className="text-right text-fg-2 tabular">{bytes(t.size)}</td>
                    <td className="text-right tabular">{bytes(t.indexes_size)}</td>
                    <td className="text-right tabular">{num(t.dead_rows)}</td>
                    <td className="whitespace-nowrap text-fg-3">{dateTime(t.analyzed_at)}</td>
                  </tr>
                ))}
            </tbody>
          </Table>
          <p className="px-4 py-3 text-[12px] text-fg-3">Строки и мёртвые строки — оценки PostgreSQL, обновляемые анализом таблиц. Размер включает индексы.</p>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Сервисы" />
            <KeyValue
              items={[
                ['Telegram-бот', s.telegram.enabled ? <Badge tone="good">@{s.telegram.username ?? 'запускается'}</Badge> : on(false)],
                [
                  'Фоновые задачи',
                  <Badge tone={s.role === 'web' ? 'gray' : schedulerOk ? 'good' : 'bad'}>
                    {s.role === 'web'
                      ? 'В отдельном worker · здесь не измеряются'
                      : schedulerOk
                        ? `последний запуск ${ago(s.scheduler.lastTickAt)}`
                        : 'Нет свежего запуска'}
                  </Badge>,
                ],
                ['Роль процесса', s.role],
                ['Запусков фонового цикла', s.scheduler.ticks],
                ['Sentry', on(s.sentry)],
                ['Хранилище файлов', s.storage],
                ['Часовой пояс сервера', s.timezone],
                ['База', <span className="font-mono text-[12px]">{s.database.label}</span>],
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Миграции" />
            {s.migrations.pending.length > 0 && <div className="px-4 pb-3 text-[13px] text-warn">Ожидают: {s.migrations.pending.join(', ')}</div>}
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
      <OperationsPanel detailed />
    </div>
  )
}
