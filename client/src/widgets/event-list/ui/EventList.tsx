import { byId, useList, type CalEvent } from '@/shared/api'
import { relDate } from '@/shared/lib'
import { Empty } from '@/shared/ui'
import { useEditor } from '@/features/edit-record'

export function EventRow({ ev }: { ev: CalEvent }) {
  const edit = useEditor()
  const projects = byId(useList('projects'))
  const project = ev.project_id ? projects.get(ev.project_id) : null
  const color = ev.color || project?.color || 'var(--accent)'
  const time = ev.all_day ? 'весь день' : `${ev.start.slice(11, 16)}${ev.end ? `–${ev.end.slice(11, 16)}` : ''}`
  return (
    <div onClick={() => edit('events', ev)} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-hover">
      <div className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px]">{ev.title}</div>
        <div className="mt-0.5 truncate text-[12px] text-fg-3">
          {relDate(ev.start)}, {time}
          {project && ` · ${project.name}`}
        </div>
      </div>
    </div>
  )
}

export function EventList({ events, empty = 'Событий нет' }: { events: CalEvent[]; empty?: string }) {
  if (!events.length) return <Empty title={empty} />
  return (
    <div className="divide-y divide-line">
      {[...events]
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((e) => (
          <EventRow key={e.id} ev={e} />
        ))}
    </div>
  )
}
