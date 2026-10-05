import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setDefaultOptions } from 'date-fns'
import { ru } from 'date-fns/locale'
import { initMonitoring, registerServiceWorker } from '@/shared/lib'
import { AuthGate } from './session/AuthGate'
import { QueryProvider } from './query/QueryProvider'
import { AppRouter } from './router/AppRouter'
import './styles/index.css'

setDefaultOptions({ locale: ru, weekStartsOn: 1 })
initMonitoring()
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <AuthGate>
        <AppRouter />
      </AuthGate>
    </QueryProvider>
  </StrictMode>,
)
