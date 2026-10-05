import type { ReactNode } from 'react'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster, toast } from 'sonner'
import { ApiError } from '@/shared/api'

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2 } },
  mutationCache: new MutationCache({ onError: (e) => toast.error(e.message) }),
})

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <Toaster position="bottom-right" theme="system" closeButton toastOptions={{ className: 'text-[13.5px] font-sans' }} />
      {children}
    </QueryClientProvider>
  )
}
