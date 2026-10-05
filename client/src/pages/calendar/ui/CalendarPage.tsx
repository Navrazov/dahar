import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { addDays, addMonths, addWeeks, endOfMonth, endOfISOWeek, format, isSameMonth, isToday, startOfISOWeek, startOfMonth } from 'date-fns'
import { CheckSquare, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { byId, type CalEvent, type Task, useList } from '@/shared/api'
import { weekDays, ymd } from '@/shared/lib'
import { Button, IconButton, PageHeader, Segmented } from '@/shared/ui'
import { ProjectFilter } from '@/entities/project'
import { useEditor } from '@/features/edit-record'

type View = 'day' | 'week' | 'month'
const HOUR = 48

interface Item {
  key: string
  kind: 'event' | 'task'
  title: string
  color: string
  allDay: boolean
  startMin: number
  endMin: number
  done?: boolean
  src: CalEvent | Task
}

const minutes = (s: string) => Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16))

function useItems(projectFilter: string) {
  const events = useList('events')
  const tasks = useList('tasks')
  const projects = byId(useList('projects'))
  return useMemo(() => {
    const keep = (pid: number | null) => !projectFilter || pid === Number(projectFilter)
    return (day: string): Item[] => {
      const out: Item[] = []
      for (const e of events) {
        if (!keep(e.project_id)) continue
        const s = e.start.slice(0, 10)
        const end = (e.end || e.start).slice(0, 10)
        if (day < s || day > end) continue
        const color = e.color || (e.project_id && projects.get(e.project_id)?.color) || 'var(--accent)'
        const allDay = !!e.all_day || s !== end
        const startMin = s === day ? minutes(e.start) : 0
        const endMin = e.end && end === day ? minutes(e.end) : e.end ? 24 * 60 : startMin + 60
        out.push({ key: `e${e.id}`, kind: 'event', title: e.title, color, allDay, startMin, endMin: Math.max(endMin, startMin + 30), src: e })
      }
      for (const t of tasks) {
        if (t.due_date !== day || !keep(t.project_id)) continue
        const color = (t.project_id && projects.get(t.project_id)?.color) || 'var(--text-3)'
        const startMin = t.due_time ? minutes('0000-00-00T' + t.due_time) : 0
        out.push({
          key: `t${t.id}`,
          kind: 'task',
          title: t.title,
          color,
          allDay: !t.due_time,
          startMin,
          endMin: startMin + 30,
          done: t.status === 'done',
          src: t,
        })
      }
      return out.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startMin - b.startMin)
    }
  }, [events, tasks, projects, projectFilter])
}

function layout(items: Item[]) {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
  const result: { item: Item; col: number; cols: number }[] = []
  let cluster: { item: Item; col: number }[] = []
  let clusterEnd = -1
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1))
    cluster.forEach((c) => result.push({ ...c, cols }))
    cluster = []
  }
  for (const item of sorted) {
    if (item.startMin >= clusterEnd) flush()
    const used = new Set(cluster.filter((c) => c.item.endMin > item.startMin).map((c) => c.col))
    let col = 0
    while (used.has(col)) col++
    cluster.push({ item, col })
    clusterEnd = Math.max(clusterEnd, item.endMin)
  }
  flush()
  return result
}

function Chip({ item, onClick }: { item: Item; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={clsx(
        'flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[12px] leading-4 hover:brightness-95',
        item.done && 'line-through opacity-60',
      )}
      style={{ background: `color-mix(in srgb, ${item.color} 16%, var(--surface))`, color: 'var(--text)' }}
    >
      {item.kind === 'task' ? (
        <CheckSquare size={10} className="shrink-0" style={{ color: item.color }} />
      ) : (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: item.color }} />
      )}
      {!item.allDay && (
        <span className="shrink-0 text-fg-3 tabular">{`${String(Math.floor(item.startMin / 60)).padStart(2, '0')}:${String(item.startMin % 60).padStart(2, '0')}`}</span>
      )}
      <span className="truncate">{item.title}</span>
    </button>
  )
}

export function CalendarPage() {
  const edit = useEditor()
  const [view, setView] = useState<View>(() => (window.innerWidth < 768 ? 'day' : 'week'))
  const [anchor, setAnchor] = useState(new Date())
  const [project, setProject] = useState('')
  const itemsFor = useItems(project)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * HOUR
  }, [view])

  const open = (item: Item) => edit(item.kind === 'event' ? 'events' : 'tasks', item.src as any)
  const newEvent = (day: string, hour = 9) => {
    const h = String(hour).padStart(2, '0')
    const h2 = String(Math.min(hour + 1, 23)).padStart(2, '0')
    edit('events', { start: `${day}T${h}:00`, end: `${day}T${h2}:00`, project_id: project ? Number(project) : null })
  }

  const step = (dir: number) => setAnchor((a) => (view === 'month' ? addMonths(a, dir) : view === 'week' ? addWeeks(a, dir) : addDays(a, dir)))
  const title =
    view === 'month'
      ? format(anchor, 'LLLL yyyy')
      : view === 'week'
        ? `${format(startOfISOWeek(anchor), 'd MMM')} — ${format(endOfISOWeek(anchor), 'd MMM yyyy')}`
        : format(anchor, 'EEEE, d MMMM yyyy')

  const days = view === 'week' ? weekDays(anchor) : [anchor]

  return (
    <>
      <PageHeader
        title="Календарь"
        actions={
          <>
            <ProjectFilter value={project} onChange={setProject} />
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'day', label: 'День' },
                { value: 'week', label: 'Неделя' },
                { value: 'month', label: 'Месяц' },
              ]}
            />
            <Button variant="primary" icon={Plus} onClick={() => newEvent(ymd(anchor))}>
              Событие
            </Button>
          </>
        }
      />

      <div className="mb-3 flex items-center gap-2">
        <Button size="sm" onClick={() => setAnchor(new Date())}>
          Сегодня
        </Button>
        <IconButton icon={ChevronLeft} label="Назад" onClick={() => step(-1)} />
        <IconButton icon={ChevronRight} label="Вперёд" onClick={() => step(1)} />
        <h2 className="text-[15px] font-semibold first-letter:uppercase">{title}</h2>
      </div>

      {view === 'month' ? (
        <MonthGrid
          anchor={anchor}
          itemsFor={itemsFor}
          onOpen={open}
          onNew={newEvent}
          onDay={(d) => {
            setAnchor(d)
            setView('day')
          }}
        />
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-line bg-surface">
          <div className="grid border-b border-line" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}>
            <div />
            {days.map((d) => (
              <button
                key={ymd(d)}
                type="button"
                onClick={() => {
                  setAnchor(d)
                  setView('day')
                }}
                className="border-l border-line px-2 py-2 text-left hover:bg-hover"
              >
                <div className="text-[12px] text-fg-3 uppercase">{format(d, 'EEE')}</div>
                <div
                  className={clsx(
                    'mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full text-[13.5px] font-semibold',
                    isToday(d) && 'bg-accent px-1.5 text-white',
                  )}
                >
                  {format(d, 'd')}
                </div>
              </button>
            ))}
            <div className="flex items-center justify-center border-t border-line text-center text-[10px] leading-tight text-fg-3">
              весь
              <br />
              день
            </div>
            {days.map((d) => (
              <div
                key={ymd(d)}
                onClick={() => edit('tasks', { due_date: ymd(d) })}
                className="min-h-8 cursor-pointer space-y-0.5 border-t border-l border-line p-1"
              >
                {itemsFor(ymd(d))
                  .filter((i) => i.allDay)
                  .map((i) => (
                    <Chip key={i.key} item={i} onClick={() => open(i)} />
                  ))}
              </div>
            ))}
          </div>
          <div ref={scroller} className="relative max-h-[calc(100vh-280px)] min-h-96 overflow-y-auto">
            <div className="grid" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))`, height: HOUR * 24 }}>
              <div className="relative">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-fg-3 tabular" style={{ top: h * HOUR }}>
                    {h > 0 && `${String(h).padStart(2, '0')}:00`}
                  </div>
                ))}
              </div>
              {days.map((d) => {
                const day = ymd(d)
                const timed = layout(itemsFor(day).filter((i) => !i.allDay))
                return (
                  <div key={day} className="relative border-l border-line">
                    {Array.from({ length: 24 }, (_, h) => (
                      <div
                        key={h}
                        onClick={() => newEvent(day, h)}
                        className="absolute inset-x-0 cursor-pointer border-t border-line/60 hover:bg-hover/60"
                        style={{ top: h * HOUR, height: HOUR }}
                      />
                    ))}
                    {isToday(d) && <NowLine />}
                    {timed.map(({ item, col, cols }) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => open(item)}
                        className={clsx(
                          'absolute overflow-hidden rounded-[7px] border-l-[3px] px-1.5 py-1 text-left text-[12px] leading-tight shadow-sm hover:brightness-95',
                          item.done && 'line-through opacity-60',
                        )}
                        style={{
                          top: (item.startMin / 60) * HOUR + 1,
                          height: Math.max(((item.endMin - item.startMin) / 60) * HOUR - 2, 20),
                          left: `calc(${(col / cols) * 100}% + 2px)`,
                          width: `calc(${100 / cols}% - 4px)`,
                          borderColor: item.color,
                          background: `color-mix(in srgb, ${item.color} 14%, var(--surface))`,
                        }}
                      >
                        <div className="flex items-center gap-1 truncate font-medium">
                          {item.kind === 'task' && <CheckSquare size={10} className="shrink-0" />}
                          {item.title}
                        </div>
                        <div className={clsx('text-fg-3 tabular', item.endMin - item.startMin < 45 && 'hidden')}>
                          {`${String(Math.floor(item.startMin / 60)).padStart(2, '0')}:${String(item.startMin % 60).padStart(2, '0')}`}
                        </div>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function NowLine() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  const top = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR
  return (
    <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top }}>
      <div className="relative h-px bg-bad">
        <div className="absolute -top-[3px] -left-[3px] h-[7px] w-[7px] rounded-full bg-bad" />
      </div>
    </div>
  )
}

function MonthGrid({
  anchor,
  itemsFor,
  onOpen,
  onNew,
  onDay,
}: {
  anchor: Date
  itemsFor: (d: string) => Item[]
  onOpen: (i: Item) => void
  onNew: (d: string) => void
  onDay: (d: Date) => void
}) {
  const start = startOfISOWeek(startOfMonth(anchor))
  const end = endOfISOWeek(endOfMonth(anchor))
  const days: Date[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d)
  return (
    <div className="overflow-hidden rounded-[10px] border border-line bg-surface">
      <div className="grid grid-cols-7 border-b border-line">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
          <div key={d} className="px-2 py-2 text-[12px] font-medium text-fg-3">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const day = ymd(d)
          const items = itemsFor(day)
          return (
            <div
              key={day}
              onClick={() => onNew(day)}
              className={clsx(
                'min-h-24 cursor-pointer p-1 hover:bg-hover/50 sm:min-h-28',
                i % 7 && 'border-l border-line',
                i >= 7 && 'border-t border-line',
                !isSameMonth(d, anchor) && 'bg-surface-2/40',
              )}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDay(d)
                }}
                className={clsx(
                  'mb-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12.5px] hover:bg-hover',
                  isToday(d) ? 'bg-accent font-semibold text-white hover:bg-accent-hover' : !isSameMonth(d, anchor) ? 'text-fg-3' : 'text-fg-2',
                )}
              >
                {format(d, 'd')}
              </button>
              <div className="space-y-0.5">
                {items.slice(0, 3).map((it) => (
                  <Chip key={it.key} item={it} onClick={() => onOpen(it)} />
                ))}
                {items.length > 3 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDay(d)
                    }}
                    className="px-1.5 text-[12px] text-fg-3 hover:text-fg"
                  >
                    ещё {items.length - 3}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
