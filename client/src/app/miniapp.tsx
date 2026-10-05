import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setDefaultOptions } from 'date-fns'
import { ru } from 'date-fns/locale'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster, toast } from 'sonner'
import { setOfflineEnabled } from '@/shared/api'
import { ApiError } from '@/shared/api'
import { haptic, initMonitoring, syncTelegramTheme } from '@/shared/lib'
import { MiniApp } from '@/pages/miniapp'
import './styles/index.css'

setOfflineEnabled(false)
setDefaultOptions({ locale: ru, weekStartsOn: 1 })
initMonitoring()
syncTelegramTheme()

// Без сохранения кэша на устройстве и офлайн-очереди: мини-приложение открывают на минуту и закрывают.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2 },
  },
  mutationCache: new MutationCache({
    onError: (e) => {
      haptic.error()
      if (!(e instanceof ApiError && e.status === 401)) toast.error(e.message)
    },
  }),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-center" theme="system" toastOptions={{ className: 'text-[14px] font-sans' }} />
      <MiniApp />
    </QueryClientProvider>
  </StrictMode>,
)
