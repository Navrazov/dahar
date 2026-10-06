import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { api, collectionKey, useList } from '@/shared/api'
import { Button, Progress } from '@/shared/ui'
import { useEditor } from '@/features/edit-record'

export function ProjectsTab() {
  const projects = useList('projects'),
    counts = useQuery({ queryKey: [...collectionKey('tasks'), 'mini-project-counts'], queryFn: ({ signal }) => api.miniProjectCounts(signal) }),
    edit = useEditor()
  const active = projects.filter((p) => p.status !== 'done' && p.status !== 'archived')
  return (
    <div className="space-y-4">
      <Button icon={Plus} onClick={() => edit('projects')}>
        Новый проект
      </Button>
      {active.length ? (
        active.map((p) => {
          const count = counts.data?.find((c) => c.project_id === p.id),
            total = count?.total ?? 0,
            done = count?.done ?? 0
          return (
            <Link key={p.id} to={`/projects/${p.id}`} className="block rounded-[14px] border border-line bg-surface p-4 active:bg-hover">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-base font-medium">{p.name}</span>
                <span className="text-xs text-fg-3">
                  {done}/{total}
                </span>
              </div>
              {p.goal && <p className="mb-3 line-clamp-2 text-sm text-fg-3">{p.goal}</p>}
              <Progress value={total ? done / total : 0} color={p.color || undefined} />
              <p className="mt-2 text-xs text-fg-3">{total - done} задач в работе →</p>
            </Link>
          )
        })
      ) : (
        <p className="py-8 text-center text-sm text-fg-3">Создай проект и собери связанные задачи в одном месте.</p>
      )}
      {projects.length > active.length && (
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-3 text-fg-3">Завершённые и архив · {projects.length - active.length}</summary>
          {projects
            .filter((p) => !active.includes(p))
            .map((p) => (
              <Link key={p.id} className="block min-h-11 rounded-lg px-3 py-3 active:bg-hover" to={`/projects/${p.id}`}>
                {p.name}
              </Link>
            ))}
        </details>
      )}
    </div>
  )
}
