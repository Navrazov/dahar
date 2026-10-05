import { nowLocal } from '../lib/date'
import { json, request } from './http'
import type { CollectionName, Collections, FinanceSummary, Settings, StatementImportResult, StatementPreview, User } from './types'

type Params = Record<string, string | number>

function withCompletion<K extends CollectionName>(t: K, data: Partial<Collections[K]>) {
  const d = data as Record<string, unknown>
  if (t === 'tasks' && d.status === 'done' && !d.completed_at) return { ...data, completed_at: nowLocal() }
  return data
}

const query = (params: Params) => new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))

export const api = {
  me: () => request<{ user: User }>('/api/auth/me'),
  login: (login: string, password: string) => request<{ user: User }>('/api/auth/login', json('POST', { login, password })),
  logout: () => request('/api/auth/logout', { method: 'POST', body: '{}' }),
  changePassword: (current: string, next: string) => request('/api/auth/password', json('POST', { current, next })),

  list: <K extends CollectionName>(t: K) => request<Collections[K][]>(`/api/${t}`),
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
  telegram: () => request<{ enabled: boolean; username: string | null; linked: boolean }>('/api/telegram'),
  telegramCode: () => request<{ code: string; link: string | null }>('/api/telegram/code', json('POST', {})),
  telegramUnlink: () => request('/api/telegram/link', { method: 'DELETE' }),
}
