import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { lazy } from 'react'
import { Shell } from '@/widgets/shell'
const SubscriptionsPage = lazy(() => import('@/pages/control').then((m) => ({ default: m.SubscriptionsPage })))
const PaymentsPage = lazy(() => import('@/pages/control').then((m) => ({ default: m.PaymentsPage })))
const TelegramPage = lazy(() => import('@/pages/control').then((m) => ({ default: m.TelegramPage })))
const DeliveriesPage = lazy(() => import('@/pages/control').then((m) => ({ default: m.DeliveriesPage })))
const AiPage = lazy(() => import('@/pages/control').then((m) => ({ default: m.AiPage })))
const ActivityPage = lazy(() => import('@/pages/activity').then((m) => ({ default: m.ActivityPage })))
const AuditPage = lazy(() => import('@/pages/audit').then((m) => ({ default: m.AuditPage })))
const ErrorsPage = lazy(() => import('@/pages/errors').then((m) => ({ default: m.ErrorsPage })))
const OverviewPage = lazy(() => import('@/pages/overview').then((m) => ({ default: m.OverviewPage })))
const SystemPage = lazy(() => import('@/pages/system').then((m) => ({ default: m.SystemPage })))
const UserPage = lazy(() => import('@/pages/user').then((m) => ({ default: m.UserPage })))
const UsersPage = lazy(() => import('@/pages/users').then((m) => ({ default: m.UsersPage })))

export function AppRouter() {
  return (
    <BrowserRouter basename="/admin">
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<OverviewPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="users/:id" element={<UserPage />} />
          <Route path="subscriptions" element={<SubscriptionsPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="telegram" element={<TelegramPage />} />
          <Route path="deliveries" element={<DeliveriesPage />} />
          <Route path="ai" element={<AiPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="errors" element={<ErrorsPage />} />
          <Route path="system" element={<SystemPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
