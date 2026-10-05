import type { Row, Schema, TableName } from '@dahar/shared'

/** Строки коллекций выводятся из общей схемы — те же поля и значения, что проверяет сервер. */
export type Project = Row<'projects'>
export type Goal = Row<'goals'>
export type Task = Row<'tasks'>
export type CalEvent = Row<'events'>
export type Habit = Row<'habits'>
export type HabitLog = Row<'habit_logs'>
export type Partner = Row<'partners'>
export type PartnerReport = Row<'partner_reports'>
export type Budget = Row<'budgets'>
export type Review = Row<'reviews'>
export type Interaction = Row<'partner_interactions'>
export type Trade = Row<'trades'>
export type Topic = Row<'trading_topics'>
export type Product = Row<'products'>
export type Customer = Row<'customers'>
export type Sale = Row<'sales'>
export type BizExpense = Row<'biz_expenses'>
export type Content = Row<'content'>
export type Account = Row<'accounts'>
export type Txn = Row<'transactions'>

type EnumOf<T extends TableName, C extends keyof Schema[T]> = Schema[T][C] extends { values: readonly (infer V)[] } ? V : never

export type Priority = EnumOf<'tasks', 'priority'>
export type TaskStatus = EnumOf<'tasks', 'status'>
export type PartnerStatus = EnumOf<'partners', 'status'>
export type ContentStatus = EnumOf<'content', 'status'>

export type Collections = { [K in TableName]: Row<K> }

export type CollectionName = keyof Collections

export interface User {
  id: number
  login: string
  name: string | null
}

/** Разбор недели, который пишет Claude по данным пользователя. */
export interface WeeklyInsight {
  summary: string
  wins: string[]
  attention: string[]
  money: string
  habits: string
  next_week: string[]
  created_at: string
}

export interface SearchHit {
  table: CollectionName
  id: number
  title: string
  snippet: string | null
  date: string | null
}

/** Если включена двухфакторная защита, после пароля сервер просит код. */
export type LoginResult = { user: User } | { twoFactor: true; ticket: string }

export type ModuleKey = 'habits' | 'partners' | 'trading' | 'business' | 'finance' | 'calculator'

export type ModulesSetting = Partial<Record<ModuleKey, { enabled: boolean; label?: string | null }>>

export interface Settings {
  currency?: string
  trading_currency?: string
  trading_start_balance?: number | null
  user_name?: string
  business_project_id?: number | null
  trading_project_id?: number | null
  partners_project_id?: number | null
  modules?: ModulesSetting
  timezone?: string | null
  digest_hour?: number | null
  reminders_enabled?: boolean
  default_account_id?: number | null
  onboarding_completed?: boolean
}

export interface FinanceSummary {
  month: string
  income: number
  expense: number
  balances: { account_id: number; balance: number }[]
  months: { month: string; income: number; expense: number }[]
  expenseCategories: { category: string; amount: number }[]
  incomeCategories: { category: string; amount: number }[]
  budgets: { id: number; category: string; amount: number; spent: number }[]
}

export interface StatementRow {
  key: string
  date: string
  time: string
  kind: 'income' | 'expense'
  amount: number
  description: string
  bank_category: string
  category: string
  duplicate: boolean
  match: { id: number; account_id: number; account_name: string } | null
}

export interface StatementPreview {
  bank: 'tbank' | 'sber' | 'csv'
  account_id: number
  rows: StatementRow[]
}

export interface StatementImportResult {
  created: number
  transfers: number
  skipped: number
}
