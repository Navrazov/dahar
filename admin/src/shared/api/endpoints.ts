import { request } from './http'
import type { Admin, AuditEntry, DailyPoint, ErrorEntry, Overview, Retention, SystemInfo, UserDetail, UserRow } from './types'

export const api = {
  me: () => request<{ admin: Admin }>('/auth/me'),
  login: (login: string, password: string) => request<{ admin: Admin }>('/auth/login', { method: 'POST', json: { login, password } }),
  logout: () => request('/auth/logout', { method: 'POST', json: {} }),
  changePassword: (current: string, next: string) => request('/auth/password', { method: 'POST', json: { current, next } }),

  overview: () => request<Overview>('/overview'),
  users: () => request<UserRow[]>('/users'),
  user: (id: number) => request<UserDetail>(`/users/${id}`),
  createUser: (data: { login: string; password: string; name?: string }) => request<UserRow>('/users', { method: 'POST', json: data }),
  updateUser: (id: number, data: { name?: string; password?: string; blocked?: boolean }) => request<UserDetail>(`/users/${id}`, { method: 'PATCH', json: data }),
  endSessions: (id: number) => request<{ ended: number }>(`/users/${id}/sessions`, { method: 'DELETE' }),
  deleteUser: (id: number, confirm: string) => request(`/users/${id}`, { method: 'DELETE', json: { confirm } }),

  retention: () => request<Retention>('/retention'),
  system: () => request<SystemInfo>('/system'),
  errors: (source: string) => request<{ items: ErrorEntry[]; daily: DailyPoint[] }>(`/errors${source ? `?source=${source}` : ''}`),
  clearErrors: () => request<{ removed: number }>('/errors', { method: 'DELETE' }),
  audit: () => request<AuditEntry[]>('/audit'),
}
