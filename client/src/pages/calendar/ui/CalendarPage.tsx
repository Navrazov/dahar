import { toast } from 'sonner'
import { accountNow } from '@/shared/lib'
import { CalendarExchange } from './CalendarExchange'
import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { addDays, addMonths, addWeeks, endOfMonth, endOfISOWeek, format, isSameMonth, isToday, startOfISOWeek, startOfMonth } from 'date-fns'
import { CheckSquare, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { byId, type CalEvent, type Task, useList, useSave } from '@/shared/api'
import { weekDays, ymd } from '@/shared/lib'
import { Button, IconButton, PageHeader, Segmented, DragDropProvider, DragHandle, DropZone, type DragItem, type DropTarget } from '@/shared/ui'
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
        if ((t.planned_date || t.due_date) !== day || !keep(t.project_id)) continue
        const color = (t.project_id && projects.get(t.project_id)?.color) || 'var(--text-3)'
        const startMin = t.due_time ? minutes('0000-00-00T' + t.due_time) : 0
        out.push({
          key: `t${t.id}`,
          kind: 'task',
          title: t.title,
          color,
          allDay: !t.due_time,
          startMin,
          endMin: Math.min(1440, startMin + (t.estimate_minutes || 30)),
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
    <div className="flex items-center rounded" style={{ background: `color-mix(in srgb, ${item.color} 16%, var(--surface))` }}>
      <DragHandle item={{ type: item.kind, id: item.src.id, title: item.title }} className="min-h-7 w-6" />
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
    </div>
  )
}

export function CalendarPage() {
  const edit = useEditor(),
    saveTask = useSave('tasks'),
    saveEvent = useSave('events'),
    tasks = useList('tasks'),
    events = useList('events')
  const moveItem = (item: DragItem, target: DropTarget) => {
    const date = target.data.date
    if (!date) return
    if (item.type === 'task') {
      const task = tasks.find((t) => t.id === item.id)
      if (!task) return
      saveTask.mutate(
        {
          id: item.id,
          due_date: date,
          planned_date: date,
          focus_date: task.focus_date === date ? task.focus_date : null,
          ...('time' in target.data ? { due_time: target.data.time } : {}),
        },
        { onSuccess: () => toast.success('Задача перенесена') },
      )
    } else {
      const event = events.find((e) => e.id === item.id)
      if (!event) return
      const duration = event.end ? Math.max(30, (Date.parse(event.end + 'Z') - Date.parse(event.start + 'Z')) / 60000) : 60
      const allDay = target.data.allDay === 'true' || (!target.data.time && event.all_day)
      const time = allDay ? '00:00' : target.data.time || event.start.slice(11, 16)
      const start = `${date}T${time}`,
        length = allDay ? Math.max(1, Math.ceil(duration / 1440)) * 1440 - 1 : event.all_day ? 60 : duration
      const end = new Date(Date.parse(start + 'Z') + length * 60000).toISOString().slice(0, 16)
      saveEvent.mutate({ id: event.id, start, end, all_day: !!allDay }, { onSuccess: () => toast.success('Событие перенесено') })
    }
  }
  const [view, setView] = useState<View>(() => (window.innerWidth < 768 ? 'day' : 'week'))
  const [anchor, setAnchor] = useState(accountNow())
  const [project, setProject] = useState('')
  const itemsFor = useItems(project)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * HOUR
  }, [view])

  const open = (item: Item) => edit(item.kind === 'event' ? 'events' : 'tasks', item.src as any)
  const newEvent = (day: string, hour = 9, minute = 0) => {
    const start = `${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    const end = new Date(Date.parse(start + 'Z') + 60 * 60000).toISOString().slice(0, 16)
    edit('events', { start, end, project_id: project ? Number(project) : null })
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
    <DragDropProvider onDrop={moveItem} disabled={saveTask.isPending || saveEvent.isPending || !navigator.onLine}>
      <PageHeader
        title="Календарь"
        actions={
          <>
            <CalendarExchange />
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
            <Button
              icon={Plus}
              onClick={() => edit('tasks', { due_date: ymd(anchor), planned_date: ymd(anchor), project_id: project ? Number(project) : null })}
            >
              Задача
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => newEvent(ymd(anchor))}>
              Событие
            </Button>
          </>
        }
      />

      <div className="mb-3 flex items-center gap-2">
        <Button size="sm" onClick={() => setAnchor(accountNow())}>
          Сегодня
        </Button>
        <IconButton icon={ChevronLeft} label="Назад" onClick={() => step(-1)} />
        <IconButton icon={ChevronRight} label="Вперёд" onClick={() => step(1)} />
        <h2 className="text-[15px] font-semibold first-letter:uppercase">{title}</h2>
      </div>

      {tasks.some((t) => t.status !== 'done' && !t.due_date && !t.planned_date && (!project || String(t.project_id) === project)) && (
        <details className="mb-3 rounded-xl border border-line bg-surface p-3">
          <summary className="min-h-9 cursor-pointer text-sm text-fg-2">Задачи без даты · перетащи в календарь</summary>
          <div className="flex flex-wrap gap-2 pt-2">
            {tasks
              .filter((t) => t.status !== 'done' && !t.due_date && !t.planned_date && (!project || String(t.project_id) === project))
              .map((t) => (
                <div key={t.id} className="flex max-w-64 items-center rounded-lg border border-line">
                  <DragHandle item={{ type: 'task', id: t.id, title: t.title }} />
                  <button type="button" className="min-h-9 truncate pr-3 text-sm" onClick={() => edit('tasks', t)}>
                    {t.title}
                  </button>
                </div>
              ))}
          </div>
        </details>
      )}
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
              <DropZone
                key={ymd(d)}
                target={{ id: `all-day:${ymd(d)}`, label: `Весь день ${ymd(d)}`, data: { date: ymd(d), time: null, allDay: 'true' } }}
                onClick={() => edit('tasks', { due_date: ymd(d), planned_date: ymd(d), project_id: project ? Number(project) : null })}
                className="min-h-8 cursor-pointer space-y-0.5 border-t border-l border-line p-1"
              >
                {itemsFor(ymd(d))
                  .filter((i) => i.allDay)
                  .map((i) => (
                    <Chip key={i.key} item={i} onClick={() => open(i)} />
                  ))}
              </DropZone>
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
                    {Array.from({ length: 96 }, (_, slot) => {
                      const h = Math.floor(slot / 4),
                        minute = (slot % 4) * 15,
                        time = `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
                      return (
                        <DropZone
                          key={slot}
                          target={{ id: `time:${day}:${time}`, label: `${day}, ${time}`, data: { date: day, time } }}
                          onClick={() => newEvent(day, h, minute)}
                          className={clsx('absolute inset-x-0 cursor-pointer hover:bg-hover/60', minute === 0 && 'border-t border-line/60')}
                          style={{ top: (slot * HOUR) / 4, height: HOUR / 4 }}
                        />
                      )
                    })}
                    {isToday(d) && <NowLine />}
                    {timed.map(({ item, col, cols }) => (
                      <DropZone
                        key={item.key}
                        target={{
                          id: `occupied:${day}:${item.key}`,
                          label: `${day}, ${String(Math.floor(item.startMin / 60)).padStart(2, '0')}:${String(item.startMin % 60).padStart(2, '0')}`,
                          data: {
                            date: day,
                            time: `${String(Math.floor(item.startMin / 60)).padStart(2, '0')}:${String(item.startMin % 60).padStart(2, '0')}`,
                          },
                        }}
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
                        <div className="flex h-full items-start">
                          <DragHandle item={{ type: item.kind, id: item.src.id, title: item.title }} className="min-h-6 w-5" />
                          <button type="button" onClick={() => open(item)} className="min-h-6 min-w-0 flex-1 text-left">
                            <div className="flex items-center gap-1 truncate font-medium">
                              {item.kind === 'task' && <CheckSquare size={10} className="shrink-0" />}
                              {item.title}
                            </div>
                            <div className={clsx('text-fg-3 tabular', item.endMin - item.startMin < 45 && 'hidden')}>
                              {`${String(Math.floor(item.startMin / 60)).padStart(2, '0')}:${String(item.startMin % 60).padStart(2, '0')}`}
                            </div>
                          </button>
                        </div>
                      </DropZone>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </DragDropProvider>
  )
}

function NowLine() {
  const [now, setNow] = useState(accountNow())
  useEffect(() => {
    const t = setInterval(() => setNow(accountNow()), 60_000)
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
            <DropZone
              key={day}
              target={{ id: `month:${day}`, label: `На ${day}`, data: { date: day } }}
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
            </DropZone>
          )
        })}
      </div>
    </div>
  )
}
