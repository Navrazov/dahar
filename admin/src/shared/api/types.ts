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
}

export interface UserDetail {
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
}

export interface SystemInfo {
  app: { name: string; version: string | null }
  node: string
  uptime: number
  memory: { rss: number; heap: number }
  timezone: string
  database: { label: string; size: number; version: string; tables: { name: string; size: number; rows: number }[] }
  migrations: { applied: { id: string; applied_at: string }[]; pending: string[] }
  storage: string
  telegram: { enabled: boolean; username: string | null }
  sentry: boolean
  scheduler: { startedAt: string | null; lastTickAt: string | null; ticks: number }
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
