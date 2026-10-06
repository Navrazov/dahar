import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { expect, test } from 'vitest'
import { invalidateCollection } from './collections'

test('changing a budget refetches the visible finance summary', async () => {
  const client = new QueryClient()
  const key = ['c', 'transactions', 'summary', '2026-10']
  client.setQueryData(key, { budgets: [] })
  const observer = new QueryObserver(client, { queryKey: key, staleTime: Infinity, queryFn: async () => ({ budgets: [{ category: 'Food', amount: 1000 }] }) })
  const unsubscribe = observer.subscribe(() => {})
  await invalidateCollection(client, 'budgets')
  expect(client.getQueryData(key)).toEqual({ budgets: [{ category: 'Food', amount: 1000 }] })
  unsubscribe()
  client.clear()
})
