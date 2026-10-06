/**
 * Единое описание пользовательских таблиц. Отсюда сервер строит колонки и проверяет записи,
 * а клиент получает типы строк. Новое поле — одна строка здесь.
 */

export type TextFormat = 'color' | 'email'

export type FieldDef =
  | { readonly type: 'text'; readonly max: number; readonly required?: boolean; readonly format?: TextFormat }
  | { readonly type: 'enum'; readonly values: readonly string[]; readonly required?: boolean }
  | { readonly type: 'int' | 'real' | 'money' | 'decimal'; readonly min?: number; readonly max?: number; readonly required?: boolean }
  | { readonly type: 'bool' }
  | { readonly type: 'weekdays' }
  | { readonly type: 'date' | 'time' | 'datetime'; readonly required?: boolean }
  | { readonly type: 'ref'; readonly ref: string; readonly onDelete?: 'cascade'; readonly required?: boolean }

export type FieldType = FieldDef['type']

const oneOf = <const V extends readonly string[]>(...values: V) => ({ type: 'enum', values }) as const

const title = { type: 'text', max: 200, required: true } as const
const short = { type: 'text', max: 200 } as const
const long = { type: 'text', max: 20_000 } as const
const color = { type: 'text', max: 32, format: 'color' } as const
const date = { type: 'date' } as const
const requiredDate = { type: 'date', required: true } as const
const money = { type: 'money' } as const
const positiveMoney = { type: 'money', min: 0 } as const
const count = { type: 'int', min: 0 } as const
const decimal = { type: 'decimal' } as const
const bool = { type: 'bool' } as const
const project = { type: 'ref', ref: 'projects' } as const

export const schema = {
  projects: {
    name: title,
    description: long,
    status: oneOf('idea', 'active', 'paused', 'done', 'archived'),
    goal: long,
    deadline: date,
    progress: { type: 'int', min: 0, max: 100 },
    color,
    icon: { type: 'text', max: 64 },
    area: short,
    pinned: bool,
  },
  goals: {
    title,
    description: long,
    project_id: project,
    target_value: { type: 'real' },
    current_value: { type: 'real' },
    unit: { type: 'text', max: 50 },
    deadline: date,
    status: oneOf('active', 'done', 'dropped'),
    metric: { type: 'text', max: 60 },
    period_start: date,
    period_end: date,
  },
  partners: {
    name: title,
    company: short,
    phone: { type: 'text', max: 50 },
    email: { type: 'text', max: 200, format: 'email' },
    telegram: { type: 'text', max: 100 },
    city: short,
    source: short,
    status: oneOf('new', 'contact', 'negotiation', 'terms', 'first_client', 'active', 'inactive'),
    comment: long,
    next_action: { type: 'text', max: 500 },
    next_action_date: date,
    project_id: project,
  },
  partner_reports: {
    partner_id: { type: 'ref', ref: 'partners', onDelete: 'cascade', required: true },
    date: requiredDate,
    applications: count,
    approvals: count,
    turnover: money,
    profit: money,
    note: long,
  },
  tasks: {
    title,
    estimate_minutes: { type: 'int', min: 1, max: 1440 },
    checklist: { type: 'text', max: 10000 },
    description: long,
    due_date: date,
    due_time: { type: 'time' },
    priority: oneOf('low', 'medium', 'high', 'urgent'),
    status: oneOf('todo', 'in_progress', 'done'),
    project_id: project,
    partner_id: { type: 'ref', ref: 'partners' },
    goal_id: { type: 'ref', ref: 'goals' },
    completed_at: { type: 'datetime' },
    repeat: oneOf('daily', 'weekdays', 'weekly', 'monthly', 'yearly', 'interval'),
    repeat_days: { type: 'weekdays' },
    repeat_interval: { type: 'int', min: 1, max: 3650 },
    repeat_spawned: bool,
    reminded_at: { type: 'datetime' },
    focus_date: date,
  },
  events: {
    title,
    external_uid: { type: 'text', max: 500 },
    description: long,
    start: { type: 'datetime', required: true },
    end: { type: 'datetime' },
    all_day: bool,
    color,
    project_id: project,
    partner_id: { type: 'ref', ref: 'partners' },
  },
  habits: {
    name: title,
    description: long,
    kind: oneOf('build', 'quit'),
    frequency: oneOf('daily', 'weekdays', 'weekly'),
    days: { type: 'weekdays' },
    per_week: { type: 'int', min: 1, max: 7 },
    color,
    project_id: project,
    start_date: date,
    archived: bool,
  },
  habit_logs: {
    habit_id: { type: 'ref', ref: 'habits', onDelete: 'cascade', required: true },
    date: requiredDate,
    status: { ...oneOf('done', 'slip'), required: true },
  },
  partner_interactions: {
    partner_id: { type: 'ref', ref: 'partners', onDelete: 'cascade', required: true },
    date: requiredDate,
    type: oneOf('call', 'meeting', 'message', 'email', 'other'),
    note: long,
  },
  trades: {
    date: requiredDate,
    instrument: { type: 'text', max: 50 },
    direction: oneOf('long', 'short'),
    entry: decimal,
    exit: decimal,
    stop_loss: decimal,
    take_profit: decimal,
    size: decimal,
    risk: money,
    pnl: money,
    fees: money,
    strategy: short,
    setup_reason: long,
    comment: long,
    mistakes: long,
    conclusions: long,
    screenshot: { type: 'text', max: 300 },
    project_id: project,
  },
  trading_topics: {
    title,
    category: short,
    status: oneOf('todo', 'learning', 'done'),
    notes: long,
    project_id: project,
  },
  products: {
    name: title,
    brand: short,
    volume: { type: 'text', max: 50 },
    purchase_price: positiveMoney,
    sale_price: positiveMoney,
    stock: { type: 'int' },
    project_id: project,
  },
  customers: {
    name: title,
    phone: { type: 'text', max: 50 },
    instagram: { type: 'text', max: 100 },
    city: short,
    notes: long,
  },
  sales: {
    date: requiredDate,
    product_id: { type: 'ref', ref: 'products' },
    customer_id: { type: 'ref', ref: 'customers' },
    quantity: count,
    amount: { ...positiveMoney, required: true },
    cost: positiveMoney,
    payment_method: { type: 'text', max: 100 },
    note: long,
    project_id: project,
  },
  biz_expenses: {
    date: requiredDate,
    category: short,
    amount: { ...positiveMoney, required: true },
    note: long,
    project_id: project,
  },
  content: {
    title,
    idea: long,
    script: long,
    platform: { type: 'text', max: 100 },
    status: oneOf('idea', 'script', 'filmed', 'edited', 'published'),
    publish_date: date,
    url: { type: 'text', max: 2000 },
    project_id: project,
  },
  accounts: {
    name: title,
    kind: oneOf('cash', 'card', 'savings', 'investment'),
    initial_balance: money,
    color,
    archived: bool,
  },
  transactions: {
    date: requiredDate,
    kind: { ...oneOf('income', 'expense', 'transfer'), required: true },
    amount: { ...positiveMoney, required: true },
    account_id: { type: 'ref', ref: 'accounts', onDelete: 'cascade' },
    to_account_id: { type: 'ref', ref: 'accounts', onDelete: 'cascade' },
    category: { type: 'text', max: 100 },
    note: { type: 'text', max: 1000 },
    project_id: project,
  },
  budgets: {
    category: { type: 'text', max: 100, required: true },
    amount: { ...positiveMoney, required: true },
  },
  reviews: {
    week_start: requiredDate,
    wins: long,
    problems: long,
    lessons: long,
    focus: long,
    rating: { type: 'int', min: 1, max: 5 },
  },
} as const satisfies Record<string, Record<string, FieldDef>>

export type Schema = typeof schema
export type TableName = keyof Schema

export const tableOrder = Object.keys(schema) as TableName[]

export const isTable = (name: unknown): name is TableName => typeof name === 'string' && Object.hasOwn(schema, name)

/** Служебные колонки: сервер ведёт их сам, клиент не пишет и не получает в типах. */
export const internalColumns = ['repeat_spawned', 'reminded_at'] as const
type Internal = (typeof internalColumns)[number]

/** Колонка, по которой работают фильтры периода `from` / `to`. */
export const dateColumn: Partial<Record<TableName, string>> = {
  tasks: 'due_date',
  events: 'start',
  habit_logs: 'date',
  partner_interactions: 'date',
  partner_reports: 'date',
  trades: 'date',
  sales: 'date',
  biz_expenses: 'date',
  transactions: 'date',
  reviews: 'week_start',
}

export const fieldsOf = (table: TableName) => Object.entries(schema[table]) as [string, FieldDef][]

export const enumValues = <T extends TableName, C extends keyof Schema[T]>(table: T, column: C) =>
  (schema[table][column] as { values: readonly string[] }).values as Schema[T][C] extends { values: readonly (infer V)[] } ? readonly V[] : never

type ValueOf<F> = F extends { type: 'enum'; values: readonly (infer V)[] }
  ? V
  : F extends { type: 'int' | 'real' | 'money' | 'decimal' | 'ref' }
    ? number
    : F extends { type: 'bool' }
      ? boolean
      : F extends { type: 'weekdays' }
        ? number[]
        : string

type Columns<T extends TableName> = Exclude<keyof Schema[T], Internal>
type RequiredColumns<T extends TableName> = { [K in Columns<T>]: Schema[T][K] extends { required: true } ? K : never }[Columns<T>]

/** Строка таблицы в том виде, в каком её отдаёт API. */
export type Row<T extends TableName> = { id: number; created_at: string } & { [K in RequiredColumns<T>]: ValueOf<Schema[T][K]> } & {
  [K in Exclude<Columns<T>, RequiredColumns<T>>]: ValueOf<Schema[T][K]> | null
}
