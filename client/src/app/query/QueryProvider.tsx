import type { ReactNode } from 'react'
import { MutationCache, onlineManager, QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { Toaster, toast } from 'sonner'
import { ApiError } from '@/shared/api'
import { idbAvailable, kv, setAccountTimezone } from '@/shared/lib'
import { SyncStatus } from './SyncStatus'
import { OfflineSync } from './OfflineSync'

const WEEK = 7 * 24 * 60 * 60 * 1000

// React Query узнаёт об офлайне только из событий; если страницу открыли уже без сети, говорим сразу.
onlineManager.setOnline(navigator.onLine)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Кэш живёт неделю: он сохраняется на устройстве и показывается без сети.
      gcTime: WEEK,
      refetchOnWindowFocus: true,
      retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
    },
    // Без сети изменения не «замирают»: request() откладывает их в очередь и сразу отвечает.
    mutations: { networkMode: 'always' },
  },
  mutationCache: new MutationCache({
    onError: (e) => {
      if (!(e instanceof ApiError && e.status === 401)) toast.error(e.message)
    },
  }),
})

const safe =
  <A extends unknown[], R>(fn: (...a: A) => Promise<R>, fallback: R) =>
  (...a: A) =>
    fn(...a).catch(() => fallback)

export const persister = createAsyncStoragePersister({
  key: 'query-cache',
  throttleTime: 2000,
  storage: idbAvailable()
    ? {
        getItem: safe(async () => {
          const owner = await kv.get<number>('query-owner')
          return (await kv.get<string>(owner ? `query-cache:${owner}` : 'query-cache')) ?? null
        }, null),
        setItem: safe(async (_k: string, value: string) => {
          const snapshot = JSON.parse(value)
          const owner = snapshot.clientState.queries.find((q: { queryKey: unknown[] }) => q.queryKey[0] === 'me')?.state.data?.id
          if (!Number.isInteger(owner)) {
            await kv.del('query-owner')
            await kv.del('query-cache')
            return
          }
          await kv.set(`query-cache:${owner}`, value)
          await kv.set('query-owner', owner)
          await kv.del('query-cache')
        }, undefined),
        removeItem: safe(async () => {
          const owner = await kv.get<number>('query-owner')
          if (owner) await kv.del(`query-cache:${owner}`)
          await kv.del('query-owner')
          await kv.del('query-cache')
        }, undefined),
      }
    : undefined,
})

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      onSuccess={() => {
        setAccountTimezone(queryClient.getQueryData<{ timezone?: string }>(['settings'])?.timezone)
      }}
      persistOptions={{
        persister,
        maxAge: WEEK,
        buster: 'v1',
        dehydrateOptions: {
          shouldDehydrateQuery: (q) =>
            q.state.status === 'success' && q.meta?.persist !== false && q.queryKey[0] !== 'search' && q.queryKey[0] !== 'two-factor',
        },
      }}
    >
      <Toaster
        expand
        gap={8}
        visibleToasts={3}
        mobileOffset={{ bottom: 88, left: 16, right: 16 }}
        position="bottom-right"
        theme="system"
        closeButton
        toastOptions={{ className: 'text-[13.5px] font-sans' }}
        style={{ zIndex: 80 }}
      />
      <OfflineSync />
      <SyncStatus />
      {children}
    </PersistQueryClientProvider>
  )
}
