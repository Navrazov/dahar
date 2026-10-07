import type { Task } from '@/shared/api'
import { priorityRank } from './options'

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const da = a.status === 'done' ? 1 : 0
    const db = b.status === 'done' ? 1 : 0
    if (da !== db) return da - db
    const dd = (a.planned_date || a.due_date || '9999').localeCompare(b.planned_date || b.due_date || '9999')
    if (dd) return dd
    if (a.sort_order != null || b.sort_order != null) {
      const order = (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER)
      if (order) return order
    }
    return (priorityRank[a.priority || 'medium'] ?? 2) - (priorityRank[b.priority || 'medium'] ?? 2) || b.id - a.id
  })
}
