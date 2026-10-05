import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { Flag, Handshake, Repeat } from 'lucide-react'
import { byId, useList, useSave, type Task } from '@/shared/api'
import { daysLeft, label, relDate } from '@/shared/lib'
import { Checkbox, Dot, Empty } from '@/shared/ui'
import { priorities, priorityColor, repeatOptions, sortTasks } from '@/entities/task'
import { useEditor } from '@/features/edit-record'

export function TaskRow({ task, hideProject }: { task: Task; hideProject?: boolean }) {
  const edit = useEditor()
  const save = useSave('tasks')
  const projects = byId(useList('projects'))
  const partners = byId(useList('partners'))
  const project = task.project_id ? projects.get(task.project_id) : null
  const partner = task.partner_id ? partners.get(task.partner_id) : null
  const done = task.status === 'done'
  const left = daysLeft(task.due_date)
  const overdue = !done && left != null && left < 0
  const showProject = project && !hideProject

  return (
    <div onClick={() => edit('tasks', task)} className="group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-hover">
      <Checkbox checked={done} label={done ? 'Вернуть в работу' : 'Выполнить'} onChange={() => save.mutate({ id: task.id, status: done ? 'todo' : 'done' })} />
      <div className="min-w-0 flex-1">
        <div className={clsx('flex items-center gap-1.5 text-[14px]', done && 'text-fg-3 line-through decoration-fg-3/60')}>
          <span className="truncate">{task.title}</span>
          {task.repeat && (
            <Repeat size={12} className="shrink-0 text-fg-3" aria-label={label(repeatOptions, task.repeat)}>
              <title>{label(repeatOptions, task.repeat)}</title>
            </Repeat>
          )}
        </div>
        {(showProject || partner) && (
          <div className="mt-0.5 flex min-w-0 items-center gap-2.5 text-[12px] text-fg-3">
            {showProject && (
              <Link to={`/projects/${project.id}`} onClick={(e) => e.stopPropagation()} className="flex min-w-0 items-center gap-1.5 hover:text-fg">
                <Dot color={project.color} className="h-1.5 w-1.5" />
                <span className="truncate">{project.name}</span>
              </Link>
            )}
            {partner && (
              <span className="flex min-w-0 items-center gap-1">
                <Handshake size={12} className="shrink-0" />
                <span className="truncate">{partner.name}</span>
              </span>
            )}
          </div>
        )}
      </div>
      {task.priority && task.priority !== 'medium' && !done && (
        <Flag size={13} style={{ color: priorityColor[task.priority] }} aria-label={label(priorities, task.priority)}>
          <title>{label(priorities, task.priority)}</title>
        </Flag>
      )}
      {task.due_date && (
        <span className={clsx('shrink-0 text-[12.5px] tabular', overdue ? 'font-medium text-bad' : 'text-fg-3')}>
          {relDate(task.due_date)}
          {task.due_time && `, ${task.due_time}`}
        </span>
      )}
    </div>
  )
}

export function TaskList({ tasks, hideProject, empty = 'Задач нет', emptyHint }: { tasks: Task[]; hideProject?: boolean; empty?: string; emptyHint?: string }) {
  if (!tasks.length) return <Empty title={empty} hint={emptyHint} />
  return (
    <div className="divide-y divide-line">
      {sortTasks(tasks).map((t) => (
        <TaskRow key={t.id} task={t} hideProject={hideProject} />
      ))}
    </div>
  )
}
