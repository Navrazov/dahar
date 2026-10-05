import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setDefaultOptions } from 'date-fns'
import { ru } from 'date-fns/locale'
import { QueryProvider } from './query/QueryProvider'
import { AppRouter } from './router/AppRouter'
import { AdminGate } from './session/AdminGate'
import './styles/index.css'

setDefaultOptions({ locale: ru, weekStartsOn: 1 })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <AdminGate>
        <AppRouter />
      </AdminGate>
    </QueryProvider>
  </StrictMode>,
)
