import type { CollectionName } from '@/shared/api'
import { entities } from './forms'

/** Как называется запись коллекции для человека: «Задача», «Сделка»… */
export const recordLabel = (table: CollectionName) => entities[table]?.title ?? (table === 'habit_logs' ? 'Отметка привычки' : table)
