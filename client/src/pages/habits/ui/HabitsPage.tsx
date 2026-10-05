import { useState } from 'react'
import clsx from 'clsx'
import { addDays, eachDayOfInterval, format, isToday, startOfISOWeek, subDays, subWeeks } from 'date-fns'
import { Pencil, Plus } from 'lucide-react'
import { byId, type Habit, useList } from '@/shared/api'
import { pct, sum, todayStr, ymd } from '@/shared/lib'
import { Badge, Button, Card, CardHeader, Empty, IconButton, PageHeader, Progress, Segmented, Stat } from '@/shared/ui'
import { freqText, habitStart, habitStats, isScheduled, useLogMap } from '@/entities/habit'
import { useEditor } from '@/features/edit-record'
import { HabitCell } from '@/features/habit-check'

function Heatmap({ habit, logs }: { habit: Habit; logs: Map<string, string> }) {
  const weeks = 17
  const start = startOfISOWeek(subWeeks(new Date(), weeks - 1))
  const days = eachDayOfInterval({ start, end: addDays(start, weeks * 7 - 1) })
  const color = habit.color || 'var(--good)'
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-[3px]" aria-label="Карта выполнения за 4 месяца">
      {days.map((d) => {
        const k = ymd(d)
        const s = logs.get(`${habit.id}:${k}`)
        const inRange = k >= habitStart(habit) && k <= todayStr()
        const good = s === 'done'
        return (
          <div
            key={k}
            title={`${format(d, 'd MMM')}${s === 'slip' ? ' — срыв' : good ? ' — выполнено' : ''}`}
            className="h-[11px] w-[11px] rounded-[3px]"
            style={{
              background: s === 'slip' ? 'var(--text)' : good ? color : inRange ? 'var(--surface-2)' : 'transparent',
              outline: inRange && !good && s !== 'slip' ? '1px solid var(--border)' : undefined,
              outlineOffset: -1,
            }}
          />
        )
      })}
    </div>
  )
}

export function HabitsPage() {
  const habits = useList('habits')
  const logs = useList('habit_logs')
  const projects = byId(useList('projects'))
  const edit = useEditor()
  const map = useLogMap(logs)
  const [show, setShow] = useState<'active' | 'archived'>('active')
  const active = habits.filter((h) => !h.archived)
  const shown = habits.filter((h) => (show === 'archived' ? h.archived : !h.archived))
  const stats = new Map(active.map((h) => [h.id, habitStats(h, logs)]))
  const last7 = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i))

  const dueToday = active.filter((h) => h.kind === 'quit' || h.frequency === 'weekly' || isScheduled(h, new Date()))
  const doneToday = dueToday.filter((h) => stats.get(h.id)?.doneToday).length
  const avg7 = active.length ? sum(active.map((h) => stats.get(h.id)!.rate7)) / active.length : 0
  const avg30 = active.length ? sum(active.map((h) => stats.get(h.id)!.rate30)) / active.length : 0
  const bestStreak = Math.max(0, ...active.map((h) => (stats.get(h.id)!.streakUnit === 'дн' ? stats.get(h.id)!.streak : 0)))

  return (
    <>
      <PageHeader
        title="Привычки"
        subtitle="Отмечайте выполнение кликом по дню. Для привычек «избавиться»: первый клик — чистый день, второй — срыв, третий — нет данных"
        actions={
          <>
            <Segmented
              value={show}
              onChange={setShow}
              options={[
                { value: 'active', label: 'Активные' },
                { value: 'archived', label: 'Архив' },
              ]}
            />
            <Button variant="primary" icon={Plus} onClick={() => edit('habits')}>
              Привычка
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Сегодня" value={`${doneToday} / ${dueToday.length}`} sub="выполнено" />
        <Stat label="За 7 дней" value={pct(avg7)} sub="средний процент выполнения" />
        <Stat label="За 30 дней" value={pct(avg30)} sub="средний процент выполнения" />
        <Stat label="Лучшая текущая серия" value={`${bestStreak} дн`} />
      </div>

      {!shown.length ? (
        <Card>
          <Empty
            title={show === 'archived' ? 'Архив пуст' : 'Привычек пока нет'}
            hint="Например: «Читать 30 минут», «Тренировка 3 раза в неделю» или «Не пользоваться телефоном после 23:00»"
            action={
              show === 'active' && (
                <Button variant="primary" icon={Plus} onClick={() => edit('habits')}>
                  Добавить привычку
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          {show === 'active' && (
            <Card className="mb-6">
              <CardHeader title="Неделя" sub="клик по ячейке — отметить" />
              <div className="overflow-x-auto px-4 pb-3">
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr>
                      <th />
                      {last7.map((d) => (
                        <th key={ymd(d)} className={clsx('w-10 pb-2 text-center text-[12px] font-medium', isToday(d) ? 'text-accent-text' : 'text-fg-3')}>
                          <div className="uppercase">{format(d, 'EEEEEE')}</div>
                          <div>{format(d, 'd')}</div>
                        </th>
                      ))}
                      <th className="w-24 pb-2 text-right text-[12px] font-medium text-fg-3">Серия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((h) => {
                      const s = stats.get(h.id)!
                      return (
                        <tr key={h.id} className="border-t border-line">
                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: h.color || 'var(--good)' }} />
                              <span className="truncate text-[13.5px]">{h.name}</span>
                              {h.kind === 'quit' && <Badge tone="bad">избавиться</Badge>}
                            </div>
                          </td>
                          {last7.map((d) => (
                            <td key={ymd(d)} className="py-1.5 text-center">
                              <div className="flex justify-center">
                                <HabitCell habit={h} date={ymd(d)} logs={map} />
                              </div>
                            </td>
                          ))}
                          <td className="text-right text-[12.5px] tabular">
                            <span className={s.streak ? 'font-medium' : 'text-fg-3'}>
                              {s.streak} {s.streakUnit}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {shown.map((h) => {
              const s = habitStats(h, logs)
              const project = h.project_id ? projects.get(h.project_id) : null
              return (
                <Card key={h.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: h.color || 'var(--good)' }} />
                        <span className="truncate text-[14px] font-semibold">{h.name}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-3">
                        <Badge tone={h.kind === 'quit' ? 'bad' : 'good'}>{h.kind === 'quit' ? 'Избавиться' : 'Сформировать'}</Badge>
                        <span>{freqText(h)}</span>
                        {project && <span>· {project.name}</span>}
                      </div>
                    </div>
                    <IconButton icon={Pencil} label="Изменить" onClick={() => edit('habits', h)} />
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                    {[
                      { l: 'Серия', v: `${s.streak} ${s.streakUnit}` },
                      { l: 'Рекорд', v: `${s.best} ${s.streakUnit}` },
                      {
                        l: h.frequency === 'weekly' && h.kind !== 'quit' ? 'Неделя' : '7 дней',
                        v: h.frequency === 'weekly' && h.kind !== 'quit' ? `${s.weekCount}/${h.per_week || 1}` : pct(s.rate7),
                      },
                      { l: 'Всего', v: pct(s.rate) },
                    ].map((x) => (
                      <div key={x.l} className="rounded-[8px] bg-surface-2 px-2 py-2">
                        <div className="text-[15px] font-semibold tabular">{x.v}</div>
                        <div className="text-[12px] text-fg-3">{x.l}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-4">
                    <div className="overflow-x-auto">
                      <Heatmap habit={h} logs={map} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-[12px] text-fg-3">
                      <span>Выполнение за 30 дней</span>
                      <span className="tabular">{pct(s.rate30)}</span>
                    </div>
                    <Progress value={s.rate30} color={h.color || undefined} />
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
