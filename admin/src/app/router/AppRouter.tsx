import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { lazy } from 'react'
import { Shell } from '@/widgets/shell'
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
