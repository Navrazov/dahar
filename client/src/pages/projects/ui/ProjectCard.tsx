import { Link } from 'react-router-dom'
import { useList, type Project } from '@/shared/api'
import { daysLeft, fmtDate, label, plural, tone } from '@/shared/lib'
import { Badge, Card, Dot, Progress } from '@/shared/ui'
import { useGoalProgress } from '@/entities/goal'
import { projectProgress, projectStatuses } from '@/entities/project'

export function ProjectCard({ p }: { p: Project }) {
  const tasks = useList('tasks')
  const goals = useList('goals')
  const gp = useGoalProgress()
  const progress = projectProgress(p, tasks, goals, gp)
  const open = tasks.filter((t) => t.project_id === p.id && t.status !== 'done').length
  const goalCount = goals.filter((g) => g.project_id === p.id && g.status === 'active').length
  const left = daysLeft(p.deadline)
  const late = left != null && left < 0 && p.status !== 'done'

  const meta = [`${open} ${plural(open, 'открытая задача', 'открытые задачи', 'открытых задач')}`, goalCount ? `${goalCount} ${plural(goalCount, 'цель', 'цели', 'целей')}` : null].filter(Boolean)

  return (
    <Link to={`/projects/${p.id}`} className="group block">
      <Card className="flex h-full flex-col p-4 transition-colors group-hover:border-line-strong">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Dot color={p.color} className="h-2.5 w-2.5" />
            <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{p.name}</span>
          </div>
          <Badge tone={tone(projectStatuses, p.status)}>{label(projectStatuses, p.status)}</Badge>
        </div>
        {(p.goal || p.description) && <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-fg-2">{p.goal || p.description}</p>}
        <div className="mt-auto pt-4">
          <div className="flex items-center gap-3">
            <Progress value={progress} color={p.color || undefined} />
            <span className="w-9 shrink-0 text-right text-[13.5px] font-medium tabular">{Math.round(progress * 100)}%</span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-3 text-[12.5px] text-fg-3">
            <span>{meta.join(' · ')}</span>
            {p.deadline && <span className={late ? 'text-bad' : ''}>до {fmtDate(p.deadline, 'd MMM yyyy')}</span>}
          </div>
        </div>
      </Card>
    </Link>
  )
}
