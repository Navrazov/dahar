import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

export function useSave<K extends CollectionName>(t: K) {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Collections[K]> & { id?: number }) =>
      id ? api.update(t, id, data as Partial<Collections[K]>) : api.create(t, data as Partial<Collections[K]>),
    onSuccess: invalidate,
  })
}

export function useRemove(t: CollectionName) {
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (id: number) => api.remove(t, id), onSuccess: invalidate })
}

export function byId<T extends { id: number }>(rows: T[]): Map<number, T> {
  return new Map(rows.map((r) => [r.id, r]))
}
