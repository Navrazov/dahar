import { nowLocal, setAccountTimezone } from '../lib/date'
import { json, request } from './http'
import type {
  MiniTaskPage,
  MiniToday,
  CollectionName,
  Collections,
  FinanceSummary,
  LoginResult,
  SearchHit,
  WeeklyInsight,
  Settings,
  StatementImportResult,
  StatementPreview,
  User,
} from './types'

type Params = Record<string, string | number>

function withCompletion<K extends CollectionName>(t: K, data: Partial<Collections[K]>) {
  const d = data as Record<string, unknown>
  if (t === 'tasks' && d.status === 'done' && !d.completed_at) return { ...data, completed_at: nowLocal() }
  return data
}

const query = (params: Params) => new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))

export const api = {
  miniTasks: (params: Params, signal?: AbortSignal) => request<MiniTaskPage>(`/api/mini/tasks?${query(params)}`, { signal }),
  miniToday: (signal?: AbortSignal) => request<MiniToday>('/api/mini/today', { signal }),
  miniWeek: (week: string, signal?: AbortSignal) =>
    request<{ week: string; completed: number; remaining_due: number }>(`/api/mini/week?week=${week}`, { signal }),
  miniProjectCounts: (signal?: AbortSignal) => request<{ project_id: number; total: number; done: number }[]>('/api/mini/project-counts', { signal }),
  me: () => request<{ user: User }>('/api/auth/me'),
  login: (login: string, password: string) => request<LoginResult>('/api/auth/login', json('POST', { login, password })),
  loginCode: (ticket: string, code: string) => request<{ user: User }>('/api/auth/login/2fa', json('POST', { ticket, code })),
  twoFactor: () => request<{ enabled: boolean; recoveryLeft: number }>('/api/auth/2fa'),
  twoFactorSetup: () => request<{ secret: string; otpauth: string }>('/api/auth/2fa/setup', json('POST', {})),
  twoFactorEnable: (code: string) => request<{ recoveryCodes: string[] }>('/api/auth/2fa/enable', json('POST', { code })),
  twoFactorDisable: (password: string, code: string) => request('/api/auth/2fa/disable', json('POST', { password, code })),
  twoFactorRecovery: (password: string, code: string) => request<{ recoveryCodes: string[] }>('/api/auth/2fa/recovery', json('POST', { password, code })),
  logout: () => request('/api/auth/logout', { method: 'POST', body: '{}' }),
  changePassword: (current: string, next: string) => request('/api/auth/password', json('POST', { current, next })),

  list: async <K extends CollectionName>(t: K) => {
    const rows: Collections[K][] = []
    let before: number | undefined
    while (true) {
      const batch = await request<Collections[K][]>(`/api/${t}?limit=500${before ? `&before=${before}` : ''}`)
      rows.push(...batch)
      if (batch.length < 500) return rows
      before = batch[batch.length - 1].id
    }
  },
  get: <K extends CollectionName>(t: K, id: number) => request<Collections[K]>(`/api/${t}/${id}`),
  search: (q: string) => request<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`),
  where: async <K extends CollectionName>(t: K, params: Params) => {
    if (params.limit) return request<Collections[K][]>(`/api/${t}?${query(params)}`)
    const rows: Collections[K][] = []
    let before: number | undefined
    while (true) {
      const batch = await request<Collections[K][]>(`/api/${t}?${query({ ...params, limit: 500, ...(before ? { before } : {}) })}`)
      rows.push(...batch)
      if (batch.length < 500) return rows
      before = batch[batch.length - 1].id
    }
  },
  create: <K extends CollectionName>(t: K, data: Partial<Collections[K]>) => request<Collections[K]>(`/api/${t}`, json('POST', withCompletion(t, data))),
  update: <K extends CollectionName>(t: K, id: number, data: Partial<Collections[K]>) =>
    request<Collections[K]>(`/api/${t}/${id}`, json('PATCH', withCompletion(t, data))),
  remove: (t: CollectionName, id: number) => request(`/api/${t}/${id}`, { method: 'DELETE' }),

  bulkTasks: (ids: number[], data: Partial<Collections['tasks']>) => request('/api/tasks/bulk', json('POST', { ids, data })),
  habitLog: (habit_id: number, date: string, status: 'done' | 'slip' | null) => request('/api/habit-log', json('PUT', { habit_id, date, status })),
  settings: () =>
    request<Settings>('/api/settings').then((settings) => {
      setAccountTimezone(settings.timezone)
      return settings
    }),
  setSetting: (key: keyof Settings, value: unknown) => request(`/api/settings/${key}`, json('PUT', { value })),
  financeSummary: (month: string) => request<FinanceSummary>(`/api/finance/summary?month=${month}`),
  statementPreview: (account_id: number, data: string) => request<StatementPreview>('/api/finance/import/preview', json('POST', { account_id, data })),
  statementImport: (account_id: number, rows: unknown[], confirm_currency = false) =>
    request<StatementImportResult>('/api/finance/import', json('POST', { account_id, rows, confirm_currency })),
  upload: (dataUrl: string) => request<{ url: string }>('/api/files', json('POST', { data: dataUrl })),
  image: async (url: string) => {
    const blob = await request<Blob>(url, undefined, 'blob')
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Не удалось загрузить изображение'))
      reader.readAsDataURL(blob)
    })
  },
  restorePreview: (backup: unknown) =>
    request<{ version: number; total: number; counts: Record<string, number>; exported_at?: string }>('/api/restore/preview', json('POST', backup)),
  restore: (backup: unknown) => request('/api/restore', json('POST', { ...(backup as object), confirm: 'replace' })),
  backup: () => request<unknown>('/api/backup'),
  checkpoints: () => request<{ id: number; created_at: string }[]>('/api/backup/checkpoints'),
  restoreCheckpoint: (id: number) => request('/api/backup/checkpoints/' + id + '/restore', json('POST', { confirm: 'replace' })),
  history: () => request<{ id: number; label: string; created_at: string; undone_at: string | null }[]>('/api/history'),
  undo: (id: number) => request('/api/history/' + id + '/undo', json('POST', {})),
  calendarPreview: (data: string) => request<{ events: { title: string; start: string; all_day: boolean }[] }>('/api/calendar/preview', json('POST', { data })),
  calendarImport: (data: string) => request<{ created: number; updated: number }>('/api/calendar/import', json('POST', { data })),
  calendarExport: () => request<string>('/api/calendar/export'),
  activation: (event: string) => request('/api/activation', json('POST', { event })),
  insight: (week: string) =>
    request<{ enabled: boolean; insight: WeeklyInsight | null; quota?: { max: number; remaining: number } }>(`/api/insights?week=${week}`),
  createInsight: (week: string) => request<WeeklyInsight>('/api/insights', json('POST', { week })),
  push: () => request<{ publicKey: string | null; devices: number }>('/api/push'),
  pushSubscribe: (sub: PushSubscriptionJSON) => request('/api/push/subscribe', json('POST', sub)),
  pushUnsubscribe: (endpoint: string) => request('/api/push/unsubscribe', json('POST', { endpoint })),
  pushTest: () => request<{ delivered: number }>('/api/push/test', json('POST', {})),
  telegram: () => request<{ enabled: boolean; username: string | null; linked: boolean }>('/api/telegram'),
  telegramCode: () => request<{ code: string; link: string | null }>('/api/telegram/code', json('POST', {})),
  telegramUnlink: () => request('/api/telegram/link', { method: 'DELETE' }),
  telegramWebApp: (initData: string) => request<{ token: string; user: User }>('/api/telegram/webapp', json('POST', { initData })),
}
