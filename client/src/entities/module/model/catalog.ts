import { Calculator, CandlestickChart, Handshake, Repeat, Store, Wallet, type LucideIcon } from 'lucide-react'
import type { ModuleKey, Settings } from '@/shared/api'

export interface ModuleDef {
  key: ModuleKey
  label: string
  to: string
  icon: LucideIcon
  description: string
  projectSetting?: 'partners_project_id' | 'trading_project_id' | 'business_project_id'
  defaultEnabled: boolean
}

export const moduleCatalog: ModuleDef[] = [
  {
    key: 'habits',
    label: 'Привычки',
    to: '/habits',
    icon: Repeat,
    defaultEnabled: true,
    description: 'Что делать каждый день и от чего избавиться. Серии и статистика',
  },
  { key: 'finance', label: 'Финансы', to: '/finance', icon: Wallet, defaultEnabled: false, description: 'Доходы, расходы, счета, бюджеты по категориям' },
  {
    key: 'calculator',
    label: 'Калькулятор',
    to: '/calculator',
    icon: Calculator,
    defaultEnabled: false,
    description: 'Сложный процент с пополнениями и график роста капитала',
  },
  {
    key: 'partners',
    label: 'Партнёры',
    to: '/partners',
    icon: Handshake,
    projectSetting: 'partners_project_id',
    defaultEnabled: false,
    description: 'Воронка партнёров, контакты, ежемесячные отчёты, оборот',
  },
  {
    key: 'trading',
    label: 'Трейдинг',
    to: '/trading',
    icon: CandlestickChart,
    projectSetting: 'trading_project_id',
    defaultEnabled: false,
    description: 'Журнал сделок, статистика, план обучения',
  },
  {
    key: 'business',
    label: 'Бизнес',
    to: '/business',
    icon: Store,
    projectSetting: 'business_project_id',
    defaultEnabled: false,
    description: 'Товары и склад, продажи, клиенты, расходы, контент-план',
  },
]

export const moduleByKey = Object.fromEntries(moduleCatalog.map((m) => [m.key, m])) as Record<ModuleKey, ModuleDef>

export function isEnabled(settings: Settings, key: ModuleKey): boolean {
  return settings.modules?.[key]?.enabled ?? moduleByKey[key].defaultEnabled
}

export function moduleLabel(settings: Settings, key: ModuleKey): string {
  return settings.modules?.[key]?.label?.trim() || moduleByKey[key].label
}
