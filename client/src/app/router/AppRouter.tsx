import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ModuleKey } from '@/shared/api'
import { EditorProvider } from '@/features/edit-record'
import { AppShell } from '@/widgets/app-shell'
import { ModuleGate } from '@/widgets/module-gate'
import { SuspenseSkeleton } from '@/shared/ui'

const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })))

const DashboardPage = page(() => import('@/pages/dashboard'), 'DashboardPage')
const TasksPage = page(() => import('@/pages/tasks'), 'TasksPage')
const CalendarPage = page(() => import('@/pages/calendar'), 'CalendarPage')
const ProjectsPage = page(() => import('@/pages/projects'), 'ProjectsPage')
const ProjectPage = page(() => import('@/pages/project'), 'ProjectPage')
const GoalsPage = page(() => import('@/pages/goals'), 'GoalsPage')
const ReviewPage = page(() => import('@/pages/review'), 'ReviewPage')
const HabitsPage = page(() => import('@/pages/habits'), 'HabitsPage')
const PartnersPage = page(() => import('@/pages/partners'), 'PartnersPage')
const TradingPage = page(() => import('@/pages/trading'), 'TradingPage')
const BusinessPage = page(() => import('@/pages/business'), 'BusinessPage')
const FinancePage = page(() => import('@/pages/finance'), 'FinancePage')
const CalculatorPage = page(() => import('@/pages/calculator'), 'CalculatorPage')
const SettingsPage = page(() => import('@/pages/settings'), 'SettingsPage')

const view = (node: ReactNode) => <Suspense fallback={<SuspenseSkeleton />}>{node}</Suspense>
const gated = (module: ModuleKey, node: ReactNode) => <ModuleGate module={module}>{view(node)}</ModuleGate>

export function AppRouter() {
  return (
    <BrowserRouter>
      <EditorProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={view(<DashboardPage />)} />
            <Route path="tasks" element={view(<TasksPage />)} />
            <Route path="calendar" element={view(<CalendarPage />)} />
            <Route path="projects" element={view(<ProjectsPage />)} />
            <Route path="projects/:id" element={view(<ProjectPage />)} />
            <Route path="goals" element={view(<GoalsPage />)} />
            <Route path="review" element={view(<ReviewPage />)} />
            <Route path="habits" element={gated('habits', <HabitsPage />)} />
            <Route path="partners" element={gated('partners', <PartnersPage />)} />
            <Route path="trading" element={gated('trading', <TradingPage />)} />
            <Route path="business" element={gated('business', <BusinessPage />)} />
            <Route path="finance" element={gated('finance', <FinancePage />)} />
            <Route path="calculator" element={gated('calculator', <CalculatorPage />)} />
            <Route path="settings" element={view(<SettingsPage />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </EditorProvider>
    </BrowserRouter>
  )
}
