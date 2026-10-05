import { nowLocal } from '../lib/date'
import { json, request } from './http'
import type {
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

  list: <K extends CollectionName>(t: K) => request<Collections[K][]>(`/api/${t}`),
  get: <K extends CollectionName>(t: K, id: number) => request<Collections[K]>(`/api/${t}/${id}`),
  search: (q: string) => request<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`),
  where: <K extends CollectionName>(t: K, params: Params) => request<Collections[K][]>(`/api/${t}?${query(params)}`),
  create: <K extends CollectionName>(t: K, data: Partial<Collections[K]>) => request<Collections[K]>(`/api/${t}`, json('POST', withCompletion(t, data))),
  update: <K extends CollectionName>(t: K, id: number, data: Partial<Collections[K]>) =>
    request<Collections[K]>(`/api/${t}/${id}`, json('PATCH', withCompletion(t, data))),
  remove: (t: CollectionName, id: number) => request(`/api/${t}/${id}`, { method: 'DELETE' }),

  habitLog: (habit_id: number, date: string, status: 'done' | 'slip' | null) => request('/api/habit-log', json('PUT', { habit_id, date, status })),
  settings: () => request<Settings>('/api/settings'),
  setSetting: (key: keyof Settings, value: unknown) => request(`/api/settings/${key}`, json('PUT', { value })),
  financeSummary: (month: string) => request<FinanceSummary>(`/api/finance/summary?month=${month}`),
  statementPreview: (account_id: number, data: string) => request<StatementPreview>('/api/finance/import/preview', json('POST', { account_id, data })),
  statementImport: (account_id: number, rows: unknown[]) => request<StatementImportResult>('/api/finance/import', json('POST', { account_id, rows })),
  upload: (dataUrl: string) => request<{ url: string }>('/api/files', json('POST', { data: dataUrl })),
  restore: (backup: unknown) => request('/api/restore', json('POST', backup)),
  insight: (week: string) => request<{ enabled: boolean; insight: WeeklyInsight | null }>(`/api/insights?week=${week}`),
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
