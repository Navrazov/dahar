import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { byId, useList, type Goal } from '@/shared/api'
import { daysLeft, fmtDate, num } from '@/shared/lib'
import { Dot, Empty, Progress } from '@/shared/ui'
import { metricLabel, useGoalProgress, useGoalValue } from '@/entities/goal'
import { useEditor } from '@/features/edit-record'

export function GoalRow({ goal, hideProject }: { goal: Goal; hideProject?: boolean }) {
  const edit = useEditor()
  const projects = byId(useList('projects'))
  const project = goal.project_id ? projects.get(goal.project_id) : null
  const value = useGoalValue()(goal)
  const p = useGoalProgress()(goal)
  const auto = metricLabel(goal.metric)
  const left = daysLeft(goal.deadline)
  const overdue = left != null && left < 0 && goal.status === 'active'

  return (
    <div onClick={() => edit('goals', goal)} className="cursor-pointer px-4 py-3 transition-colors hover:bg-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={clsx('truncate text-[14px]', goal.status !== 'active' && 'text-fg-3 line-through')}>{goal.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[12px] text-fg-3">
            {project && !hideProject && (
              <Link to={`/projects/${project.id}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 hover:text-fg">
                <Dot color={project.color} className="h-1.5 w-1.5" />
                {project.name}
              </Link>
            )}
            {auto && <span title={`Считается автоматически: ${auto}`}>считается сама</span>}
            {goal.deadline && <span className={overdue ? 'text-bad' : ''}>до {fmtDate(goal.deadline, 'd MMM yyyy')}</span>}
          </div>
        </div>
        <div className="shrink-0 text-right text-[13px] tabular">
          {goal.target_value ? (
            <>
              <span className="font-medium">{num(value, 2)}</span>
              <span className="text-fg-3">
                {' '}
                / {num(goal.target_value, 2)} {goal.unit}
              </span>
            </>
          ) : (
            <span className="text-fg-3">{Math.round(p * 100)}%</span>
          )}
        </div>
      </div>
      <Progress value={p} size="sm" className="mt-2.5" color={goal.status === 'done' ? 'var(--good)' : project?.color || undefined} />
    </div>
  )
}

const statusOrder: Record<string, number> = { active: 0, done: 1, dropped: 2 }

export function GoalList({ goals, hideProject }: { goals: Goal[]; hideProject?: boolean }) {
  if (!goals.length) return <Empty title="Целей нет" hint="Цель с числом, например «10 партнёров», сама показывает прогресс" />
  const sorted = [...goals].sort(
    (a, b) => (statusOrder[a.status || 'active'] ?? 0) - (statusOrder[b.status || 'active'] ?? 0) || (a.deadline || '9').localeCompare(b.deadline || '9'),
  )
  return (
    <div className="divide-y divide-line">
      {sorted.map((g) => (
        <GoalRow key={g.id} goal={g} hideProject={hideProject} />
      ))}
    </div>
  )
}
