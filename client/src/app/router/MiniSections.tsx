import { lazy, Suspense } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useSettings, type ModuleKey } from '@/shared/api'
import { Card, SuspenseSkeleton } from '@/shared/ui'
import { isEnabled } from '@/entities/module'
import { ModuleGate } from '@/widgets/module-gate'
const Tasks = lazy(() => import('@/pages/tasks').then((m) => ({ default: m.TasksPage })))
const Habits = lazy(() => import('@/pages/habits').then((m) => ({ default: m.HabitsPage })))
const Projects = lazy(() => import('@/pages/projects').then((m) => ({ default: m.ProjectsPage })))
const Project = lazy(() => import('@/pages/project').then((m) => ({ default: m.ProjectPage })))
const Goals = lazy(() => import('@/pages/goals').then((m) => ({ default: m.GoalsPage })))
const Calendar = lazy(() => import('@/pages/calendar').then((m) => ({ default: m.CalendarPage })))
const Review = lazy(() => import('@/pages/review').then((m) => ({ default: m.ReviewPage })))
const Finance = lazy(() => import('@/pages/finance').then((m) => ({ default: m.FinancePage })))
const Partners = lazy(() => import('@/pages/partners').then((m) => ({ default: m.PartnersPage })))
const Trading = lazy(() => import('@/pages/trading').then((m) => ({ default: m.TradingPage })))
const Business = lazy(() => import('@/pages/business').then((m) => ({ default: m.BusinessPage })))
const Calculator = lazy(() => import('@/pages/calculator').then((m) => ({ default: m.CalculatorPage })))
const Settings = lazy(() => import('@/pages/settings').then((m) => ({ default: m.SettingsPage })))
const sections: { path: string; label: string; hint: string; module?: ModuleKey }[] = [
  { path: '/tasks', label: 'Все задачи', hint: 'Сроки, проекты и повторения' },
  { path: '/calendar', label: 'Календарь', hint: 'События и расписание' },
  { path: '/habits/manage', label: 'Все привычки', hint: 'Создание, расписание и статистика', module: 'habits' },
  { path: '/projects', label: 'Проекты', hint: 'Планы и связанные задачи' },
  { path: '/goals', label: 'Цели', hint: 'Прогресс и показатели' },
  { path: '/review', label: 'Итоги недели', hint: 'Результаты и следующий шаг' },
  { path: '/finance', label: 'Финансы', hint: 'Счета, бюджеты и выписки', module: 'finance' },
  { path: '/partners', label: 'Партнёры', hint: 'Контакты и отчёты', module: 'partners' },
  { path: '/business', label: 'Бизнес', hint: 'Продажи и товары', module: 'business' },
  { path: '/trading', label: 'Трейдинг', hint: 'Сделки и обучение', module: 'trading' },
  { path: '/settings', label: 'Настройки', hint: 'Профиль, направления и данные' },
]
function Hub() {
  const settings = useSettings()
  const visible = sections.filter((s) => !s.module || isEnabled(settings, s.module))
  const extra = visible.filter((s) => ['partners', 'trading', 'business'].includes(s.module || ''))
  const core = visible.filter((s) => !extra.includes(s))
  const rows = (items: typeof sections) =>
    items.map((s) => (
      <Link key={s.path} to={s.path} className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 active:bg-hover">
        <span>
          <span className="block text-[15px] font-medium">{s.label}</span>
          <span className="text-[13px] text-fg-3">{s.hint}</span>
        </span>
        <span aria-hidden className="text-fg-3">
          ›
        </span>
      </Link>
    ))
  return (
    <div className="space-y-4">
      {isEnabled(settings, 'finance') && (
        <Link className="block min-h-14 rounded-xl border border-line bg-surface p-4 text-sm font-medium" to="/money">
          Записать трату или доход →
        </Link>
      )}
      <Card className="divide-y divide-line">{rows(core)}</Card>
      {extra.length > 0 && (
        <details className="rounded-xl border border-line bg-surface">
          <summary className="min-h-14 cursor-pointer px-4 py-4 text-sm text-fg-3">Дополнительные направления</summary>
          <div className="divide-y divide-line">{rows(extra)}</div>
        </details>
      )}
    </div>
  )
}
export function MiniSections() {
  const { pathname } = useLocation()
  return (
    <>
      <div className="mb-4 flex gap-3 text-[14px]">
        {pathname !== '/' && pathname !== '/more' && (
          <Link to="/more" className="text-accent">
            ← Все разделы
          </Link>
        )}
      </div>
      <Suspense fallback={<SuspenseSkeleton />}>
        <Routes>
          <Route index element={<Hub />} />
          <Route path="more" element={<Hub />} />
          <Route path="tasks" element={<Tasks />} />
          <Route
            path="habits/manage"
            element={
              <ModuleGate module="habits">
                <Habits />
              </ModuleGate>
            }
          />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<Project />} />
          <Route path="goals" element={<Goals />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="review/advanced" element={<Review />} />
          <Route
            path="finance"
            element={
              <ModuleGate module="finance">
                <Finance />
              </ModuleGate>
            }
          />
          <Route
            path="finance/calculator"
            element={
              <ModuleGate module="finance">
                <Calculator />
              </ModuleGate>
            }
          />
          <Route
            path="partners"
            element={
              <ModuleGate module="partners">
                <Partners />
              </ModuleGate>
            }
          />
          <Route
            path="business"
            element={
              <ModuleGate module="business">
                <Business />
              </ModuleGate>
            }
          />
          <Route
            path="trading"
            element={
              <ModuleGate module="trading">
                <Trading />
              </ModuleGate>
            }
          />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}
