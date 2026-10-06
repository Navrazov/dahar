import { request } from './http'
import type {
  AiRunsPage,
  DeliveryRow,
  Page,
  PaymentsPage,
  ProductMetrics,
  SubscriptionsPage,
  TelegramPage,
  Admin,
  AdminLoginStep,
  AuditPage,
  ErrorsPage,
  Operations,
  Overview,
  Retention,
  SystemInfo,
  UserDetail,
  UserRow,
  UsersPage,
} from './types'

const search = (params: Record<string, string | number>) => new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()

export const api = {
  me: () => request<{ admin: Admin }>('/auth/me'),
  login: (login: string, password: string) => request<AdminLoginStep>('/auth/login', { method: 'POST', json: { login, password } }),
  loginCode: (ticket: string, code: string) => request<{ admin: Admin }>('/auth/login/2fa', { method: 'POST', json: { ticket, code } }),
  logout: () => request('/auth/logout', { method: 'POST', json: {} }),
  changePassword: (current: string, next: string) => request('/auth/password', { method: 'POST', json: { current, next } }),

  overview: () => request<Overview>('/overview'),
  users: (params: Record<string, string | number>, signal?: AbortSignal) => request<UsersPage>(`/users?paged=1&${search(params)}`, { signal }),
  user: (id: number) => request<UserDetail>(`/users/${id}`),
  createUser: (data: { login: string; password: string; name?: string }) => request<UserRow>('/users', { method: 'POST', json: data }),
  updateUser: (id: number, data: { name?: string; password?: string; blocked?: boolean }) =>
    request<UserDetail>(`/users/${id}`, { method: 'PATCH', json: data }),
  endSessions: (id: number) => request<{ ended: number }>(`/users/${id}/sessions`, { method: 'DELETE' }),
  deleteUser: (id: number, confirm: string) => request(`/users/${id}`, { method: 'DELETE', json: { confirm } }),

  subscriptions: (params: Record<string, string | number>, signal?: AbortSignal) => request<SubscriptionsPage>(`/subscriptions?${search(params)}`, { signal }),
  payments: (params: Record<string, string | number>, signal?: AbortSignal) => request<PaymentsPage>(`/payments?${search(params)}`, { signal }),
  telegram: (params: Record<string, string | number>, signal?: AbortSignal) => request<TelegramPage>(`/telegram?${search(params)}`, { signal }),
  deliveries: (params: Record<string, string | number>, signal?: AbortSignal) => request<Page<DeliveryRow>>(`/deliveries?${search(params)}`, { signal }),
  aiRuns: (params: Record<string, string | number>, signal?: AbortSignal) => request<AiRunsPage>(`/ai-runs?${search(params)}`, { signal }),
  productMetrics: () => request<ProductMetrics>('/product-metrics'),
  retention: () => request<Retention>('/retention'),
  system: () => request<SystemInfo>('/system'),
  operations: () => request<Operations>('/operations'),
  errors: (params: Record<string, string | number>, signal?: AbortSignal) => request<ErrorsPage>(`/errors?${search(params)}`, { signal }),
  clearErrors: () => request<{ removed: number }>('/errors', { method: 'DELETE' }),
  audit: (params: Record<string, string | number>, signal?: AbortSignal) => request<AuditPage>(`/audit?paged=1&${search(params)}`, { signal }),
}
