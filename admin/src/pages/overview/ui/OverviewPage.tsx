import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import { bytes, collectionLabels, moduleLabels, num, pct } from '@/shared/lib'
import { Card, CardHeader, MetricStrip, PageHeader } from '@/shared/ui'
import { DailyArea, DailyBars, RankBars } from '@/shared/ui/charts'

export function OverviewPage() {
  const { data } = useQuery({ queryKey: ['overview'], queryFn: api.overview, refetchInterval: 60_000 })
  if (!data) return null
  const t = data.totals
  const last30 = data.daily.slice(-30)
  const series = (key: 'signups' | 'active' | 'records', days = data.daily) => days.map((d) => ({ day: d.day, value: d[key] }))
  const stickiness = t.mau ? t.dau / t.mau : 0

  return (
    <>
      <PageHeader title="Обзор" subtitle="Как живёт сервис. Здесь только количества, содержимое записей пользователей не показывается." />

      <MetricStrip
        className="mb-4"
        items={[
          { label: 'Пользователи', value: num(t.users), sub: `+${t.new7} за неделю, +${t.new30} за месяц` },
          { label: 'Активны сегодня', value: num(t.dau), sub: `за неделю ${t.wau}, за месяц ${t.mau}` },
          { label: 'Возвращаемость', value: pct(stickiness), sub: 'сегодня из активных за месяц' },
          { label: 'Записей', value: num(t.records), sub: `+${num(t.records7)} за неделю` },
          { label: 'Ошибки за сутки', value: num(t.errors24), tone: t.errors24 ? 'bad' : null, sub: t.errors24 ? 'см. раздел «Ошибки»' : 'всё спокойно' },
        ]}
      />
      <MetricStrip
        className="mb-8"
        items={[
          { label: 'Активные сессии', value: num(t.sessions) },
          { label: 'С Telegram', value: num(t.telegram), sub: t.users ? `${pct(t.telegram / t.users)} пользователей` : undefined },
          { label: 'Заблокированы', value: num(t.blocked) },
          { label: 'Файлы', value: num(t.files), sub: bytes(t.files_size) },
          { label: 'База данных', value: bytes(t.db_size) },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader title="Активные пользователи по дням" sub="90 дней" />
          <div className="px-2 pb-3">
            <DailyArea data={series('active')} name="Активных" height={220} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Регистрации" sub="30 дней" />
          <div className="px-2 pb-3">
            <DailyBars data={series('signups', last30)} name="Новых" color="var(--s3)" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Создано записей" sub="30 дней" />
          <div className="px-2 pb-3">
            <DailyBars data={series('records', last30)} name="Записей" color="var(--s7)" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Что заводят чаще всего" sub="всего записей" />
          <RankBars items={data.collections.slice(0, 10).map((c) => ({ label: collectionLabels[c.collection] ?? c.collection, value: c.total }))} />
        </Card>
        <Card>
          <CardHeader title="Подключённые направления" sub="доля пользователей" />
          <RankBars items={[...data.adoption].sort((a, b) => b.users - a.users).map((m) => ({ label: moduleLabels[m.key] ?? m.key, value: m.users }))} total={t.users || 1} color="var(--s2)" />
        </Card>
      </div>
    </>
  )
}
