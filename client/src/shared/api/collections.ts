import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { api } from './endpoints'
import type { CollectionName, Collections } from './types'

const EMPTY: never[] = []

export const collectionKey = (t: CollectionName) => ['c', t] as const

export function useList<K extends CollectionName>(t: K): Collections[K][] {
  const { data } = useQuery({ queryKey: collectionKey(t), queryFn: () => api.list(t) })
  return data ?? EMPTY
}

export function useListWhere<K extends CollectionName>(t: K, params: Record<string, string | number>, enabled = true): Collections[K][] {
  const { data } = useQuery({ queryKey: [...collectionKey(t), params], queryFn: () => api.where(t, params), enabled })
  return data ?? EMPTY
}

export function useLoaded(t: CollectionName): boolean {
  return useQuery({ queryKey: collectionKey(t), queryFn: () => api.list(t) }).isSuccess
}

function useInvalidateAll() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries()
}

/** Сразу правит закэшированные списки, чтобы интерфейс не ждал сервера. Возвращает откат. */
export async function patchLists<T>(qc: QueryClient, key: QueryKey, patch: (rows: T[]) => T[]) {
  await qc.cancelQueries({ queryKey: key })
  const prev = qc.getQueriesData({ queryKey: key })
  qc.setQueriesData({ queryKey: key }, (old: unknown) => (Array.isArray(old) ? patch(old) : old))
  return () => prev.forEach(([k, d]) => qc.setQueryData(k, d))
}

export function useSave<K extends CollectionName>(t: K) {
  const qc = useQueryClient()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Collections[K]> & { id?: number }) =>
      id ? api.update(t, id, data as Partial<Collections[K]>) : api.create(t, data as Partial<Collections[K]>),
    onMutate: ({ id, ...data }) => (id ? patchLists<Collections[K]>(qc, collectionKey(t), (rows) => rows.map((r) => (r.id === id ? { ...r, ...data } : r))) : undefined),
    onError: (_e, _v, rollback) => rollback?.(),
    onSettled: invalidate,
  })
}

export function useRemove(t: CollectionName) {
  const qc = useQueryClient()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (id: number) => api.remove(t, id),
    onMutate: (id) => patchLists<{ id: number }>(qc, collectionKey(t), (rows) => rows.filter((r) => r.id !== id)),
    onError: (_e, _v, rollback) => rollback?.(),
    onSettled: invalidate,
  })
}

export function byId<T extends { id: number }>(rows: T[]): Map<number, T> {
  return new Map(rows.map((r) => [r.id, r]))
}
