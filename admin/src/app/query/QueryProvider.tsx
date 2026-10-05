import type { ReactNode } from 'react'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster, toast } from 'sonner'
import { ApiError } from '@/shared/api'
import { useTheme } from '@/shared/lib'

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2 } },
  mutationCache: new MutationCache({ onError: (e) => toast.error(e.message) }),
})

export function QueryProvider({ children }: { children: ReactNode }) {
  const [theme] = useTheme()
  return (
    <QueryClientProvider client={client}>
      <Toaster expand gap={8} position="bottom-right" theme={theme} closeButton toastOptions={{ className: 'text-[13.5px] font-sans' }} />
      {children}
    </QueryClientProvider>
  )
}
