import type { Goal, Project, Task } from '@/shared/api'
import { sum } from '@/shared/lib'

export function projectProgress(p: Project, tasks: Task[], goals: Goal[], goalProgress: (g: Goal) => number): number {
  if (p.progress != null) return Math.max(0, Math.min(100, p.progress)) / 100
  if (p.status === 'done') return 1
  const parts: number[] = []
  const pg = goals.filter((g) => g.project_id === p.id && g.status !== 'dropped')
  if (pg.length) parts.push(sum(pg.map(goalProgress)) / pg.length)
  const pt = tasks.filter((t) => t.project_id === p.id)
  if (pt.length) parts.push(pt.filter((t) => t.status === 'done').length / pt.length)
  return parts.length ? sum(parts) / parts.length : 0
}
