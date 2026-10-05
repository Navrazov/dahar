import type { ModuleKey } from '@/shared/api'
import type { Option } from '@/shared/lib'

export const goalStatuses: Option[] = [
  { value: 'active', label: 'Активна', tone: 'accent' },
  { value: 'done', label: 'Достигнута', tone: 'good' },
  { value: 'dropped', label: 'Отменена', tone: 'gray' },
]

export const goalMetrics: { value: string; label: string; unit: string; module?: ModuleKey }[] = [
  { value: 'project_tasks_done', label: 'Выполнено задач проекта', unit: 'задач' },
  { value: 'partners_active', label: 'Активных партнёров', unit: 'партнёров', module: 'partners' },
  { value: 'partners_total', label: 'Партнёров в базе', unit: 'партнёров', module: 'partners' },
  { value: 'partner_applications_month', label: 'Заявок от партнёров за месяц', unit: 'заявок', module: 'partners' },
  { value: 'partner_turnover_month', label: 'Оборот партнёров за месяц', unit: '₽', module: 'partners' },
  { value: 'business_net_month', label: 'Чистая прибыль бизнеса за месяц', unit: '₽', module: 'business' },
  { value: 'business_revenue_month', label: 'Выручка бизнеса за месяц', unit: '₽', module: 'business' },
  { value: 'business_sales_month', label: 'Продаж за месяц', unit: 'продаж', module: 'business' },
  { value: 'trading_pnl_total', label: 'P&L трейдинга, всего', unit: '$', module: 'trading' },
  { value: 'trading_pnl_month', label: 'P&L трейдинга за месяц', unit: '$', module: 'trading' },
  { value: 'trading_balance', label: 'Баланс торгового счёта', unit: '$', module: 'trading' },
  { value: 'trading_topics_done', label: 'Изучено тем трейдинга', unit: 'тем', module: 'trading' },
  { value: 'finance_savings', label: 'Накопления (счета «Накопления»)', unit: '₽', module: 'finance' },
  { value: 'finance_investments', label: 'Инвестиции (счета «Инвестиции»)', unit: '₽', module: 'finance' },
  { value: 'finance_net_month', label: 'Остаток месяца (доход − расход)', unit: '₽', module: 'finance' },
]

export const metricLabel = (m: string | null | undefined) => goalMetrics.find((g) => g.value === m)?.label
