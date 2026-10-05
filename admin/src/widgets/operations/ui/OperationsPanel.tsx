import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import { dateTime, num } from '@/shared/lib'
import { Card, CardHeader, Empty, KeyValue, MetricStrip, QueryState, QueryToolbar, Table } from '@/shared/ui'

export function OperationsPanel({ detailed = false }: { detailed?: boolean }) {
  const query = useQuery({ queryKey: ['operations'], queryFn: api.operations, refetchInterval: 60_000 })
  const { data: d } = query
  if (!d) return <QueryState query={query} title="Диагностика" />
  return (
    <section className="mt-5 space-y-4" aria-label="Диагностика сервиса">
      <Card>
        <CardHeader title="Использование и защита" />
        <MetricStrip
          items={[
            { label: 'Выполнили первую задачу', value: num(d.users.completed) },
            { label: 'Завершили знакомство', value: num(d.users.onboarded) },
            { label: 'Не заходили', value: num(d.users.never_seen) },
            { label: 'Защита 2FA', value: num(d.users.two_factor) },
          ]}
        />
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Доставка уведомлений" sub="подтверждения по каналам" />
          {!d.deliveries.length ? (
            <Empty title="Отправок ещё не было" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Канал</th>
                  <th>Доставлено / 24 ч</th>
                  <th>Не доставлены</th>
                  <th>Лимит попыток</th>
                </tr>
              </thead>
              <tbody>
                {d.deliveries.map((r) => (
                  <tr key={r.channel}>
                    <td>{r.channel === 'telegram' ? 'Telegram' : r.channel === 'push' ? 'Web Push' : r.channel}</td>
                    <td className="tabular">{r.delivered24}</td>
                    <td className="tabular">{r.pending}</td>
                    <td className={r.failed ? 'text-bad tabular' : 'tabular'}>{r.failed}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <p className="px-4 pb-4 text-[12px] text-fg-3">
            «Не доставлены» — сохранённые подтверждения с менее чем 5 попытками. Актуальность напоминания проверяет обработчик перед отправкой.
          </p>
        </Card>
        <Card>
          <CardHeader title="Данные и восстановление" />
          <KeyValue
            items={[
              ['Подписки Web Push', num(d.users.push_subscriptions)],
              ['Копии перед восстановлением', num(d.users.backups)],
              ['Изменений за 7 дней', num(d.users.changes7)],
              ['Ожидают соединения с БД', num(d.pool.waiting)],
            ]}
          />
        </Card>
      </div>
      {detailed && (
        <Card>
          <CardHeader title="Соединения и статистика PostgreSQL" />
          <KeyValue
            items={[
              ['Соединения приложения', `${d.pool.total} / ${d.pool.max} · свободны ${d.pool.idle}`],
              ['Соединения с базой (все процессы)', num(d.database.connections)],
              ['Попадания в кэш PostgreSQL', d.database.cache_hit === null ? 'Нет статистики' : `${d.database.cache_hit}%`],
              ['Подтверждённые транзакции', num(d.database.xact_commit)],
              ['Откаты транзакций', num(d.database.xact_rollback)],
              ['Взаимные блокировки', num(d.database.deadlocks)],
              ['Статистика с', d.database.stats_reset ? dateTime(d.database.stats_reset) : 'С начала сбора PostgreSQL'],
            ]}
          />
          <p className="px-4 pb-4 text-[12px] text-fg-3">Счётчики PostgreSQL накопительные. Откат транзакции может быть штатным отказом валидации.</p>
        </Card>
      )}
      <QueryToolbar query={query} />
    </section>
  )
}
