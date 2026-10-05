import type { CollectionName, Collections } from '@/shared/api'

let nextId = 1

/** Строка коллекции для тестов: всё не указанное — null. */
export function row<K extends CollectionName>(_table: K, fields: Partial<Collections[K]> = {}): Collections[K] {
  return { id: nextId++, created_at: '2026-01-01T00:00:00Z', ...fields } as Collections[K]
}
