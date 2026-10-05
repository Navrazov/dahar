export interface Base {
  id: number
  created_at: string
}

export interface Project extends Base {
  name: string
  description: string | null
  status: 'idea' | 'active' | 'paused' | 'done' | 'archived' | null
  goal: string | null
  deadline: string | null
  progress: number | null
  color: string | null
  icon: string | null
  area: string | null
  pinned: boolean | null
}

export interface Goal extends Base {
  title: string
  description: string | null
  project_id: number | null
  target_value: number | null
  current_value: number | null
  unit: string | null
  deadline: string | null
  status: 'active' | 'done' | 'dropped' | null
  metric: string | null
}

export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'todo' | 'in_progress' | 'done'

export interface Task extends Base {
  title: string
  description: string | null
  due_date: string | null
  due_time: string | null
  priority: Priority | null
  status: TaskStatus | null
  project_id: number | null
  partner_id: number | null
  goal_id: number | null
  completed_at: string | null
  repeat: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly' | 'interval' | null
  repeat_days: number[] | null
  repeat_interval: number | null
}

export interface CalEvent extends Base {
  title: string
  description: string | null
  start: string
  end: string | null
  all_day: boolean | null
  color: string | null
  project_id: number | null
  partner_id: number | null
}

export interface Habit extends Base {
  name: string
  description: string | null
  kind: 'build' | 'quit' | null
  frequency: 'daily' | 'weekdays' | 'weekly' | null
  days: number[] | null
  per_week: number | null
  color: string | null
  project_id: number | null
  start_date: string | null
  archived: boolean | null
}

export interface HabitLog extends Base {
  habit_id: number
  date: string
  status: 'done' | 'slip'
}

export type PartnerStatus = 'new' | 'contact' | 'negotiation' | 'terms' | 'first_client' | 'active' | 'inactive'

export interface Partner extends Base {
  name: string
  company: string | null
  phone: string | null
  email: string | null
  telegram: string | null
  city: string | null
  source: string | null
  status: PartnerStatus | null
  comment: string | null
  next_action: string | null
  next_action_date: string | null
  project_id: number | null
}

export interface PartnerReport extends Base {
  partner_id: number
  date: string
  applications: number | null
  approvals: number | null
  turnover: number | null
  profit: number | null
  note: string | null
}

export interface Budget extends Base {
  category: string
  amount: number | null
}

export interface Review extends Base {
  week_start: string
  wins: string | null
  problems: string | null
  lessons: string | null
  focus: string | null
  rating: number | null
}

export interface Interaction extends Base {
  partner_id: number
  date: string
  type: string | null
  note: string | null
}

export interface Trade extends Base {
  date: string
  instrument: string | null
  direction: 'long' | 'short' | null
  entry: number | null
  exit: number | null
  stop_loss: number | null
  take_profit: number | null
  size: number | null
  risk: number | null
  pnl: number | null
  fees: number | null
  strategy: string | null
  setup_reason: string | null
  comment: string | null
  mistakes: string | null
  conclusions: string | null
  screenshot: string | null
  project_id: number | null
}

export interface Topic extends Base {
  title: string
  category: string | null
  status: 'todo' | 'learning' | 'done' | null
  notes: string | null
  project_id: number | null
}

export interface Product extends Base {
  name: string
  brand: string | null
  volume: string | null
  purchase_price: number | null
  sale_price: number | null
  stock: number | null
  project_id: number | null
}

export interface Customer extends Base {
  name: string
  phone: string | null
  instagram: string | null
  city: string | null
  notes: string | null
}

export interface Sale extends Base {
  date: string
  product_id: number | null
  customer_id: number | null
  quantity: number | null
  amount: number | null
  cost: number | null
  payment_method: string | null
  note: string | null
  project_id: number | null
}

export interface BizExpense extends Base {
  date: string
  category: string | null
  amount: number | null
  note: string | null
  project_id: number | null
}

export type ContentStatus = 'idea' | 'script' | 'filmed' | 'edited' | 'published'

export interface Content extends Base {
  title: string
  idea: string | null
  script: string | null
  platform: string | null
  status: ContentStatus | null
  publish_date: string | null
  url: string | null
  project_id: number | null
}

export interface Account extends Base {
  name: string
  kind: 'cash' | 'card' | 'savings' | 'investment' | null
  initial_balance: number | null
  color: string | null
  archived: boolean | null
}

export interface Txn extends Base {
  date: string
  kind: 'income' | 'expense' | 'transfer'
  amount: number | null
  account_id: number | null
  to_account_id: number | null
  category: string | null
  note: string | null
  project_id: number | null
}

export interface Collections {
  projects: Project
  goals: Goal
  tasks: Task
  events: CalEvent
  habits: Habit
  habit_logs: HabitLog
  partners: Partner
  partner_interactions: Interaction
  partner_reports: PartnerReport
  budgets: Budget
  reviews: Review
  trades: Trade
  trading_topics: Topic
  products: Product
  customers: Customer
  sales: Sale
  biz_expenses: BizExpense
  content: Content
  accounts: Account
  transactions: Txn
}

export type CollectionName = keyof Collections

export interface User {
  id: number
  login: string
  name: string | null
}

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
  bank: 'tbank' | 'sber'
  account_id: number
  rows: StatementRow[]
}

export interface StatementImportResult {
  created: number
  transfers: number
  skipped: number
}
