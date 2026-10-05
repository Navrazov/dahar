import type { Task } from '@/shared/api'
import { priorityRank } from './options'

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const da = a.status === 'done' ? 1 : 0
    const db = b.status === 'done' ? 1 : 0
    if (da !== db) return da - db
    const dd = (a.due_date || '9999').localeCompare(b.due_date || '9999')
    if (dd) return dd
    return (priorityRank[a.priority || 'medium'] ?? 2) - (priorityRank[b.priority || 'medium'] ?? 2)
  })
}
