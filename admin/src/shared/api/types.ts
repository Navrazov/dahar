export interface Admin {
  id: number
  login: string
  last_login_at?: string | null
}

/** После пароля админка всегда спрашивает второй фактор; при первом входе — привязывает приложение. */
export type AdminLoginStep = { twoFactor: true; ticket: string } | { setupRequired: true; ticket: string; secret: string; otpauth: string }

export interface DailyPoint {
  day: string
  value: number
}

export interface Overview {
  totals: {
    users: number
    new7: number
    new30: number
    blocked: number
    telegram: number
    dau: number
    wau: number
    mau: number
    sessions: number
    files: number
    files_size: number
    db_size: number
    errors24: number
    records: number
    records7: number
  }
  collections: { collection: string; total: number; week: number }[]
  adoption: { key: string; users: number }[]
  activation: { event: string; users: number }[]
  daily: { day: string; signups: number; active: number; records: number }[]
}

export interface UserRow {
  id: number
  login: string
  name: string | null
  created_at: string
  last_seen_at: string | null
  blocked_at: string | null
  telegram: boolean
  sessions: number
  active_days: number
  files_size: number
  records: number
  two_factor: boolean
}

export interface UserDetail {
  telegram_chat_id: string | null
  last_miniapp_at: string | null
  trial_ends_at: string | null
  id: number
  login: string
  name: string | null
  created_at: string
  last_seen_at: string | null
  blocked_at: string | null
  telegram: boolean
  files: number
  files_size: number
  last_record_at: string | null
  collections: { collection: string; total: number }[]
  activity: DailyPoint[]
  sessions: { created_at: string; expires_at: string; ip: string | null; user_agent: string | null }[]
  timezone: string | null
  currency: string | null
  modules: string[]
  two_factor: boolean
  reminders_enabled: boolean
  digest_hour: number
  milestones: { event: string; created_at: string }[]
  health: { errors30: number; failed_deliveries: number; push_subscriptions: number; backups: number }
}

export interface SystemInfo {
  app: { name: string; version: string | null }
  node: string
  uptime: number
  memory: { rss: number; heap: number }
  timezone: string
  database: {
    label: string
    size: number
    version: string
    tables: { name: string; size: number; rows: number; indexes_size: number; dead_rows: number; analyzed_at: string | null }[]
  }
  migrations: { applied: { id: string; applied_at: string }[]; pending: string[] }
  storage: string
  telegram: { enabled: boolean; username: string | null }
  sentry: boolean
  scheduler: { startedAt: string | null; lastTickAt: string | null; ticks: number }
  role: 'all' | 'web' | 'worker'
}

export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}
export interface UsersPage extends Page<UserRow> {
  summary: { total: number; active: number; idle: number; blocked: number; telegram: number; secure: number }
}
export interface ErrorsPage extends Page<ErrorEntry> {
  daily: DailyPoint[]
  server: number
  client: number
  affected: number
  groups: { source: string; message: string; count: number; last_at: string }[]
}
export interface AuditPage extends Page<AuditEntry> {
  actions: { action: string; total: number }[]
}
export interface Operations {
  sampled_at: string
  deliveries: { channel: string; total: number; delivered: number; delivered24: number; pending: number; failed: number; due: number }[]
  database: { connections: number; xact_commit: number; xact_rollback: number; deadlocks: number; cache_hit: number | null; stats_reset: string | null }
  pool: { total: number; idle: number; waiting: number; max: number }
  users: { two_factor: number; never_seen: number; completed: number; onboarded: number; push_subscriptions: number; backups: number; changes7: number }
}

export interface ErrorEntry {
  id: number
  source: 'server' | 'client'
  message: string
  stack: string | null
  context: Record<string, unknown> | null
  created_at: string
  user: string | null
}

export interface AuditEntry {
  id: number
  action: string
  target: string | null
  meta: Record<string, unknown> | null
  ip: string | null
  created_at: string
  admin: string | null
}

export interface Retention {
  cohorts: { cohort: string; size: number; weeks: (number | null)[] }[]
  top: { id: number; login: string; name: string | null; days: number }[]
}

export type SubscriptionStatus = 'active' | 'trial' | 'expired' | 'pilot'
export interface SubscriptionRow {
  user_id: number
  login: string
  name: string | null
  blocked_at: string | null
  status: SubscriptionStatus
  trial_ends_at: string | null
  paid_until: string | null
  cancel_at_period_end: boolean | null
  updated_at: string | null
  paid_payments: number
}
export interface SubscriptionsPage extends Page<SubscriptionRow> {
  checkout_available: boolean
  summary: { total: number; active: number; trial: number; expired: number; pilot: number; canceling: number }
}
export interface PaymentRow {
  id: string
  user_id: number | null
  login: string | null
  name: string | null
  provider: string
  provider_payment_id: string
  status: string
  plan: string | null
  amount: string
  currency: string
  refunded_amount: string
  created_at: string
  paid_at: string | null
  updated_at: string
}
export interface PaymentsPage extends Page<PaymentRow> {
  checkout_available: boolean
  money: { currency: string; gross: string; refunded: string; net: string }[]
  statuses: { status: string; count: number }[]
}
export interface TelegramRow {
  user_id: number
  login: string
  name: string | null
  chat_id: string
  blocked_at: string | null
  last_seen_at: string | null
  last_miniapp_at: string | null
  linked_at: string | null
  failed: number
  last_delivered_at: string | null
}
export interface TelegramPage extends Page<TelegramRow> {
  summary: { linked: number; miniapp: number; miniapp7: number; affected: number }
}
export interface DeliveryRow {
  user_id: number
  login: string
  name: string | null
  key: string
  channel: string
  attempts: number
  delivered_at: string | null
  next_attempt_at: string
  last_error: string | null
}
export interface AiRunRow {
  last_error: string | null
  user_id: number
  login: string
  name: string | null
  key: string
  week_start: string
  status: string
  model: string | null
  input_tokens: number | null
  output_tokens: number | null
  cost_usd: string | null
  duration_ms: number | null
  created_at: string
}
export interface AiRunsPage extends Page<AiRunRow> {
  summary: { requests: number; failed: number; unpriced: number; known_cost_usd: string; input_tokens: string; output_tokens: string }
}
export interface ProductMetrics {
  window_days: number
  definition: string
  dau: number
  wau: number
  mau: number
  events: { event: string; users: number; occurrences: number }[]
}
