import type { ReactNode } from 'react'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster, toast } from 'sonner'
import { ApiError } from '@/shared/api'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
    },
  },
  mutationCache: new MutationCache({
    onError: (e) => {
      if (!(e instanceof ApiError && e.status === 401)) toast.error(e.message)
    },
  }),
})

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="bottom-right" theme="system" closeButton toastOptions={{ className: 'text-[13.5px] font-sans' }} style={{ zIndex: 80 }} />
      {children}
    </QueryClientProvider>
  )
}
