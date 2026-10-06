import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { api } from '@/shared/api'
import { ago, bytes, collectionLabels, dateTime, activationLabels, deviceOf, moduleLabels, num } from '@/shared/lib'
import { Badge, Card, CardHeader, Empty, KeyValue, MetricStrip, PageHeader, QueryState, QueryToolbar, Table } from '@/shared/ui'
import { ActivityGrid, RankBars } from '@/shared/ui/charts'
import { UserActions } from '@/features/manage-user'

export function UserPage() {
  const id = Number(useParams().id)
  const subscription = useQuery({ queryKey: ['subscriptions', id], queryFn: () => api.subscriptions({ user_id: id }), retry: false })
  const query = useQuery({ queryKey: ['user', id], queryFn: () => api.user(id), retry: false })

  const { data: u } = query
  if (!u) return <QueryState query={query} title="Пользователь" />

  const records = u.collections.reduce((a, c) => a + c.total, 0)
  const activeDays = u.activity.filter((d) => d.value).length

  return (
    <div className="content-enter">
      <Link to="/users" className="mb-3 inline-flex items-center gap-1 text-[13px] text-fg-3 hover:text-fg">
        <ArrowLeft size={14} /> Пользователи
      </Link>
      <PageHeader
        title={u.name || u.login}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            @{u.login}
            {u.blocked_at && <Badge tone="bad">Заблокирован {ago(u.blocked_at)}</Badge>}
            {u.telegram && <Badge>Telegram привязан</Badge>}
          </span>
        }
        actions={<UserActions user={u} />}
      />

      <QueryToolbar query={query} />
      <MetricStrip
        className="mb-8"
        items={[
          { label: 'Был в сети', value: ago(u.last_seen_at) },
          { label: 'Дней активности', value: num(activeDays), sub: 'за полгода' },
          { label: 'Записей', value: num(records), sub: u.last_record_at ? `последняя ${ago(u.last_record_at)}` : 'пока нет' },
          { label: 'Файлы', value: num(u.files), sub: bytes(u.files_size) },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Когда заходил" sub="последние полгода" />
            <div className="px-4 pb-4">
              <ActivityGrid days={u.activity} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Записи по разделам" />
            {records ? (
              <RankBars items={u.collections.map((c) => ({ label: collectionLabels[c.collection] ?? c.collection, value: c.total }))} />
            ) : (
              <Empty title="Записей нет" />
            )}
          </Card>
          <Card>
            <CardHeader title="Первые полезные действия" />
            {u.milestones.length ? (
              <KeyValue items={u.milestones.map((m) => [activationLabels[m.event] ?? m.event, dateTime(m.created_at)])} />
            ) : (
              <Empty title="Пока нет отмеченных шагов" />
            )}
          </Card>
          <Card>
            <CardHeader title="Активные сессии" sub={u.sessions.length} />
            {!u.sessions.length ? (
              <Empty title="Нет активных сессий" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Устройство</th>
                    <th>IP</th>
                    <th>Вход</th>
                    <th>Истекает</th>
                  </tr>
                </thead>
                <tbody>
                  {u.sessions.map((s, i) => (
                    <tr key={i}>
                      <td>{deviceOf(s.user_agent)}</td>
                      <td className="text-fg-2 tabular">{s.ip ?? '—'}</td>
                      <td className="whitespace-nowrap text-fg-2">{dateTime(s.created_at)}</td>
                      <td className="whitespace-nowrap text-fg-3">{dateTime(s.expires_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Подписка и платежи" />
            {!subscription.data ? (
              <QueryState query={subscription} title="Подписка" />
            ) : (
              <KeyValue
                items={[
                  [
                    'Статус',
                    ({ active: 'Активна', trial: 'Пробный период', expired: 'Истекла', pilot: 'Пилот' } as Record<string, string>)[
                      subscription.data.items[0]?.status
                    ] || '—',
                  ],
                  ['Trial до', dateTime(u.trial_ends_at)],
                  ['Оплачено до', dateTime(subscription.data.items[0]?.paid_until)],
                  [
                    'Платежи',
                    <Link className="text-accent-text" to={`/payments?user_id=${id}`}>
                      Открыть журнал →
                    </Link>,
                  ],
                  [
                    'Подписка',
                    <Link className="text-accent-text" to={`/subscriptions?user_id=${id}`}>
                      Подробнее →
                    </Link>,
                  ],
                ]}
              />
            )}
          </Card>
          <Card>
            <CardHeader title="Telegram" />
            <KeyValue
              items={[
                ['Подключён', u.telegram ? 'Да' : 'Нет'],
                ['Telegram ID', u.telegram_chat_id || '—'],
                ['Последний Mini App', dateTime(u.last_miniapp_at)],
                [
                  'Доставки',
                  <Link className="text-accent-text" to={`/deliveries?user_id=${id}`}>
                    Открыть журнал →
                  </Link>,
                ],
                [
                  'Ошибки',
                  <Link className="text-accent-text" to={`/errors?user_id=${id}`}>
                    Ошибки пользователя →
                  </Link>,
                ],
                [
                  'AI',
                  <Link className="text-accent-text" to={`/ai?user_id=${id}`}>
                    Генерации →
                  </Link>,
                ],
              ]}
            />
          </Card>
          <Card className="self-start">
            <CardHeader title="Профиль" />
            <KeyValue
              items={[
                ['ID', u.id],
                ['Защита 2FA', <Badge tone={u.two_factor ? 'good' : 'warn'}>{u.two_factor ? 'Включена' : 'Не включена'}</Badge>],
                ['Напоминания', u.reminders_enabled ? 'Включены' : 'Выключены'],
                ['Время дайджеста', `${u.digest_hour}:00`],
                ['Подписки Web Push', u.health.push_subscriptions],
                ['Резервные версии', u.health.backups],
                ['Ошибки за 30 дней', u.health.errors30],
                ['Исчерпаны попытки доставки', u.health.failed_deliveries],
                ['Создан', dateTime(u.created_at)],
                ['Часовой пояс', u.timezone ?? '—'],
                ['Валюта', u.currency ?? '₽'],
                ['Направления', u.modules.map((m) => moduleLabels[m] ?? m).join(', ') || '—'],
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  )
}
