import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ActivityPage } from '@/pages/activity'
import { AuditPage } from '@/pages/audit'
import { ErrorsPage } from '@/pages/errors'
import { OverviewPage } from '@/pages/overview'
import { SystemPage } from '@/pages/system'
import { UserPage } from '@/pages/user'
import { UsersPage } from '@/pages/users'
import { Shell } from '@/widgets/shell'

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
