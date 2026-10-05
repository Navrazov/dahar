import type { ReactNode } from 'react'
import { MutationCache, onlineManager, QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { Toaster, toast } from 'sonner'
import { ApiError } from '@/shared/api'
import { idbAvailable, kv } from '@/shared/lib'
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
        getItem: safe((k: string) => kv.get<string>(k).then((v) => v ?? null), null),
        setItem: safe((k: string, v: string) => kv.set(k, v), undefined),
        removeItem: safe((k: string) => kv.del(k), undefined),
      }
    : undefined,
})

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: WEEK,
        buster: 'v1',
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && q.queryKey[0] !== 'search' && q.queryKey[0] !== 'two-factor' },
      }}
    >
      <Toaster position="bottom-right" theme="system" closeButton toastOptions={{ className: 'text-[13.5px] font-sans' }} style={{ zIndex: 80 }} />
      <OfflineSync />
      {children}
    </PersistQueryClientProvider>
  )
}
