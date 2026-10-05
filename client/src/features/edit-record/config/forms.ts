import type { CollectionName, Settings } from '@/shared/api'
import { nowLocal, todayStr, type Option } from '@/shared/lib'
import { contentStatuses } from '@/entities/business'
import { accountKinds, txnKinds } from '@/entities/finance'
import { goalMetrics, goalStatuses } from '@/entities/goal'
import { habitFrequencies, habitKinds } from '@/entities/habit'
import { interactionTypes, partnerStatuses } from '@/entities/partner'
import { projectStatuses } from '@/entities/project'
import { priorities, repeatOptions, taskStatuses } from '@/entities/task'
import { directions, topicStatuses } from '@/entities/trade'

export type RefTable = 'projects' | 'partners' | 'products' | 'customers' | 'accounts' | 'goals'

export type Field = {
  name: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'date' | 'time' | 'datetime' | 'select' | 'ref' | 'color' | 'checkbox' | 'image' | 'days' | 'phone' | 'telegram' | 'email'
  options?: Option[]
  ref?: RefTable
  suggest?: boolean
  suggestFrom?: { table: CollectionName; column: string }
  required?: boolean
  placeholder?: string
  full?: boolean
  when?: (v: Values) => boolean
  suffix?: string
  positive?: boolean
}

export type Values = Record<string, any>

export interface EntityConfig {
  newLabel: string
  title: string
  fields: Field[]
  defaults?: (s: Settings) => Values
  derive?: (v: Values, changed: string, ctx: { products: any[] }) => Values
}

const project: Field = { name: 'project_id', label: 'Проект', type: 'ref', ref: 'projects' }

export const entities: Partial<Record<CollectionName, EntityConfig>> = {
  projects: {
    newLabel: 'Новый проект',
    title: 'Проект',
    fields: [
      { name: 'name', label: 'Название', type: 'text', required: true, full: true, placeholder: 'Например: Развитие партнёрской сети' },
      { name: 'description', label: 'Описание', type: 'textarea', full: true },
      { name: 'goal', label: 'Цель проекта', type: 'textarea', full: true, placeholder: 'Чего хочу достичь' },
      { name: 'status', label: 'Статус', type: 'select', options: projectStatuses },
      { name: 'area', label: 'Категория', type: 'text', suggest: true, placeholder: 'Работа, Учёба, Личное…' },
      { name: 'deadline', label: 'Дедлайн', type: 'date' },
      { name: 'progress', label: 'Прогресс (пусто = авто)', type: 'number', placeholder: 'Авто по задачам и целям', suffix: '%', positive: true },
      { name: 'color', label: 'Цвет', type: 'color' },
      { name: 'pinned', label: 'Закрепить на главной', type: 'checkbox' },
    ],
    defaults: () => ({ status: 'active', color: '#e2551f' }),
  },
  goals: {
    newLabel: 'Новая цель',
    title: 'Цель',
    fields: [
      { name: 'title', label: 'Цель', type: 'text', required: true, full: true, placeholder: 'Например: 10 активных партнёров' },
      { name: 'description', label: 'Описание', type: 'textarea', full: true },
      project,
      { name: 'status', label: 'Статус', type: 'select', options: goalStatuses },
      { name: 'metric', label: 'Как считать прогресс', type: 'select', options: [{ value: '', label: 'Вручную' }, ...goalMetrics.map((m) => ({ value: m.value, label: m.label }))], full: true },
      { name: 'current_value', label: 'Текущее значение', type: 'number', when: (v) => !v.metric },
      { name: 'target_value', label: 'Целевое значение', type: 'number' },
      { name: 'unit', label: 'Единица', type: 'text', suggest: true, placeholder: 'партнёров, ₽, книг…' },
      { name: 'deadline', label: 'Срок', type: 'date' },
    ],
    defaults: () => ({ status: 'active', current_value: 0, metric: '' }),
    derive: (v, changed) => {
      if (changed !== 'metric' || !v.metric) return {}
      const m = goalMetrics.find((g) => g.value === v.metric)
      return m && !v.unit ? { unit: m.unit } : {}
    },
  },
  tasks: {
    newLabel: 'Новая задача',
    title: 'Задача',
    fields: [
      { name: 'title', label: 'Название', type: 'text', required: true, full: true, placeholder: 'Что нужно сделать?' },
      { name: 'description', label: 'Описание', type: 'textarea', full: true },
      { name: 'due_date', label: 'Срок', type: 'date' },
      { name: 'due_time', label: 'Время', type: 'time' },
      { name: 'priority', label: 'Приоритет', type: 'select', options: priorities },
      { name: 'status', label: 'Статус', type: 'select', options: taskStatuses },
      project,
      { name: 'goal_id', label: 'Цель', type: 'ref', ref: 'goals' },
      { name: 'partner_id', label: 'Партнёр', type: 'ref', ref: 'partners' },
      { name: 'repeat', label: 'Повторять', type: 'select', options: repeatOptions },
      { name: 'repeat_interval', label: 'Каждые', type: 'number', suffix: 'дн.', positive: true, when: (v) => v.repeat === 'interval' },
      { name: 'repeat_days', label: 'По дням', type: 'days', when: (v) => v.repeat === 'weekly' },
    ],
    defaults: () => ({ status: 'todo', priority: 'medium', due_date: todayStr(), repeat: '' }),
  },
  events: {
    newLabel: 'Новое событие',
    title: 'Событие',
    fields: [
      { name: 'title', label: 'Название', type: 'text', required: true, full: true },
      { name: 'all_day', label: 'Весь день', type: 'checkbox', full: true },
      { name: 'start', label: 'Начало', type: 'datetime', required: true },
      { name: 'end', label: 'Окончание', type: 'datetime' },
      { name: 'description', label: 'Описание', type: 'textarea', full: true },
      project,
      { name: 'partner_id', label: 'Партнёр', type: 'ref', ref: 'partners' },
      { name: 'color', label: 'Цвет (иначе — цвет проекта)', type: 'color', full: true },
    ],
    defaults: () => ({ start: nowLocal() }),
  },
  habits: {
    newLabel: 'Новая привычка',
    title: 'Привычка',
    fields: [
      { name: 'name', label: 'Название', type: 'text', required: true, full: true, placeholder: 'Читать 30 минут' },
      { name: 'kind', label: 'Тип', type: 'select', options: habitKinds },
      { name: 'frequency', label: 'Периодичность', type: 'select', options: habitFrequencies, when: (v) => v.kind !== 'quit' },
      { name: 'days', label: 'Дни недели', type: 'days', full: true, when: (v) => v.kind !== 'quit' && v.frequency === 'weekdays' },
      { name: 'per_week', label: 'Раз в неделю', type: 'number', positive: true, suffix: 'раз', when: (v) => v.kind !== 'quit' && v.frequency === 'weekly' },
      { name: 'start_date', label: 'Начало отслеживания', type: 'date' },
      project,
      { name: 'description', label: 'Заметка', type: 'textarea', full: true },
      { name: 'color', label: 'Цвет', type: 'color', full: true },
      { name: 'archived', label: 'В архиве', type: 'checkbox' },
    ],
    defaults: () => ({ kind: 'build', frequency: 'daily', start_date: todayStr(), color: '#1f8a5b', per_week: 3, days: [1, 2, 3, 4, 5] }),
  },
  partners: {
    newLabel: 'Новый партнёр',
    title: 'Партнёр',
    fields: [
      { name: 'name', label: 'Имя / название', type: 'text', required: true },
      { name: 'company', label: 'Компания', type: 'text' },
      { name: 'status', label: 'Статус', type: 'select', options: partnerStatuses },
      { name: 'source', label: 'Источник', type: 'text', suggest: true },
      { name: 'phone', label: 'Телефон', type: 'phone' },
      { name: 'telegram', label: 'Telegram', type: 'telegram' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'city', label: 'Город', type: 'text', suggest: true },
      { name: 'next_action', label: 'Следующее действие', type: 'text' },
      { name: 'next_action_date', label: 'Дата действия', type: 'date' },
      project,
      { name: 'comment', label: 'Комментарий', type: 'textarea', full: true },
    ],
    defaults: (s) => ({ status: 'new', project_id: s.partners_project_id ?? null }),
  },
  partner_reports: {
    newLabel: 'Новый отчёт партнёра',
    title: 'Отчёт партнёра',
    fields: [
      { name: 'partner_id', label: 'Партнёр', type: 'ref', ref: 'partners', required: true },
      { name: 'date', label: 'Дата / период', type: 'date', required: true },
      { name: 'applications', label: 'Заявки', type: 'number', suffix: 'шт', positive: true },
      { name: 'approvals', label: 'Одобрения', type: 'number', suffix: 'шт', positive: true },
      { name: 'turnover', label: 'Оборот', type: 'number', suffix: 'cur' },
      { name: 'profit', label: 'Прибыль', type: 'number', suffix: 'cur' },
      { name: 'note', label: 'Комментарий', type: 'textarea', full: true },
    ],
    defaults: () => ({ date: todayStr() }),
  },
  budgets: {
    newLabel: 'Новый бюджет',
    title: 'Бюджет',
    fields: [
      { name: 'category', label: 'Категория расходов', type: 'text', required: true, placeholder: 'Кафе, продукты…', suggestFrom: { table: 'transactions', column: 'category' } },
      { name: 'amount', label: 'Лимит в месяц', type: 'number', required: true, suffix: 'cur', positive: true },
    ],
  },
  partner_interactions: {
    newLabel: 'Новое взаимодействие',
    title: 'Взаимодействие',
    fields: [
      { name: 'date', label: 'Дата', type: 'date', required: true },
      { name: 'type', label: 'Тип', type: 'select', options: interactionTypes },
      { name: 'note', label: 'Что обсудили', type: 'textarea', full: true },
    ],
    defaults: () => ({ date: todayStr(), type: 'call' }),
  },
  trades: {
    newLabel: 'Новая сделка',
    title: 'Сделка',
    fields: [
      { name: 'date', label: 'Дата', type: 'date', required: true },
      { name: 'instrument', label: 'Инструмент', type: 'text', suggest: true, required: true, placeholder: 'BTCUSDT, EURUSD…' },
      { name: 'direction', label: 'Направление', type: 'select', options: directions },
      { name: 'strategy', label: 'Стратегия', type: 'text', suggest: true },
      { name: 'entry', label: 'Вход', type: 'number', positive: true },
      { name: 'exit', label: 'Выход', type: 'number', positive: true },
      { name: 'stop_loss', label: 'Stop Loss', type: 'number', positive: true },
      { name: 'take_profit', label: 'Take Profit', type: 'number', positive: true },
      { name: 'size', label: 'Объём позиции', type: 'number', positive: true },
      { name: 'risk', label: 'Риск', type: 'number', suffix: 'tcur', positive: true },
      { name: 'pnl', label: 'Прибыль / убыток', type: 'number', placeholder: 'Пусто = открыта', suffix: 'tcur' },
      { name: 'fees', label: 'Комиссия', type: 'number', suffix: 'tcur', positive: true },
      { name: 'setup_reason', label: 'Причина входа', type: 'textarea', full: true },
      { name: 'mistakes', label: 'Ошибки', type: 'textarea', full: true },
      { name: 'conclusions', label: 'Выводы', type: 'textarea', full: true },
      { name: 'comment', label: 'Комментарий', type: 'textarea', full: true },
      { name: 'screenshot', label: 'Скриншот', type: 'image', full: true },
      project,
    ],
    defaults: (s) => ({ date: todayStr(), direction: 'long', project_id: s.trading_project_id ?? null }),
    derive: (v, changed) => {
      if (['entry', 'exit', 'size', 'direction'].includes(changed) && v.entry && v.exit && v.size && (v.pnl == null || v.pnl === '' || v._autoPnl)) {
        const diff = (Number(v.exit) - Number(v.entry)) * (v.direction === 'short' ? -1 : 1)
        return { pnl: +(diff * Number(v.size)).toFixed(2), _autoPnl: true }
      }
      if (changed === 'pnl') return { _autoPnl: false }
      return {}
    },
  },
  trading_topics: {
    newLabel: 'Новая тема',
    title: 'Тема обучения',
    fields: [
      { name: 'title', label: 'Тема', type: 'text', required: true, full: true, placeholder: 'Risk Management' },
      { name: 'category', label: 'Раздел', type: 'text', suggest: true, placeholder: 'Теханализ, Психология…' },
      { name: 'status', label: 'Статус', type: 'select', options: topicStatuses },
      { name: 'notes', label: 'Конспект / заметки', type: 'textarea', full: true },
      project,
    ],
    defaults: (s) => ({ status: 'todo', project_id: s.trading_project_id ?? null }),
  },
  products: {
    newLabel: 'Новый товар',
    title: 'Товар',
    fields: [
      { name: 'name', label: 'Название', type: 'text', required: true, full: true },
      { name: 'brand', label: 'Бренд', type: 'text', suggest: true },
      { name: 'volume', label: 'Объём', type: 'text', suggest: true, placeholder: '50 мл' },
      { name: 'purchase_price', label: 'Закупочная цена', type: 'number', suffix: 'cur', positive: true },
      { name: 'sale_price', label: 'Цена продажи', type: 'number', suffix: 'cur', positive: true },
      { name: 'stock', label: 'На складе', type: 'number', suffix: 'шт' },
      project,
    ],
    defaults: (s) => ({ stock: 0, project_id: s.business_project_id ?? null }),
  },
  customers: {
    newLabel: 'Новый клиент',
    title: 'Клиент',
    fields: [
      { name: 'name', label: 'Имя', type: 'text', required: true },
      { name: 'phone', label: 'Телефон', type: 'phone' },
      { name: 'instagram', label: 'Instagram', type: 'text' },
      { name: 'city', label: 'Город', type: 'text', suggest: true },
      { name: 'notes', label: 'Заметки', type: 'textarea', full: true },
    ],
  },
  sales: {
    newLabel: 'Новая продажа',
    title: 'Продажа',
    fields: [
      { name: 'date', label: 'Дата', type: 'date', required: true },
      { name: 'product_id', label: 'Товар', type: 'ref', ref: 'products' },
      { name: 'customer_id', label: 'Клиент', type: 'ref', ref: 'customers' },
      { name: 'quantity', label: 'Количество', type: 'number', suffix: 'шт', positive: true },
      { name: 'amount', label: 'Сумма продажи', type: 'number', required: true, suffix: 'cur', positive: true },
      { name: 'cost', label: 'Себестоимость', type: 'number', suffix: 'cur', positive: true },
      { name: 'payment_method', label: 'Способ оплаты', type: 'text', suggest: true, placeholder: 'Карта, наличные, перевод…' },
      project,
      { name: 'note', label: 'Комментарий', type: 'textarea', full: true },
    ],
    defaults: (s) => ({ date: todayStr(), quantity: 1, project_id: s.business_project_id ?? null }),
    derive: (v, changed, { products }) => {
      if (changed !== 'product_id' && changed !== 'quantity') return {}
      const p = products.find((x) => x.id === Number(v.product_id))
      if (!p) return {}
      const q = Number(v.quantity) || 1
      return { amount: (p.sale_price || 0) * q, cost: (p.purchase_price || 0) * q }
    },
  },
  biz_expenses: {
    newLabel: 'Новый расход',
    title: 'Расход бизнеса',
    fields: [
      { name: 'date', label: 'Дата', type: 'date', required: true },
      { name: 'amount', label: 'Сумма', type: 'number', required: true, suffix: 'cur', positive: true },
      { name: 'category', label: 'Категория', type: 'text', suggest: true, placeholder: 'Реклама, доставка, упаковка…' },
      project,
      { name: 'note', label: 'Комментарий', type: 'textarea', full: true },
    ],
    defaults: (s) => ({ date: todayStr(), project_id: s.business_project_id ?? null }),
  },
  content: {
    newLabel: 'Новый контент',
    title: 'Контент',
    fields: [
      { name: 'title', label: 'Название', type: 'text', required: true, full: true, placeholder: 'Reels: обзор новинки' },
      { name: 'status', label: 'Этап', type: 'select', options: contentStatuses },
      { name: 'platform', label: 'Площадка', type: 'text', suggest: true, placeholder: 'Instagram Reels, TikTok…' },
      { name: 'publish_date', label: 'Дата публикации', type: 'date' },
      { name: 'url', label: 'Ссылка', type: 'text' },
      { name: 'idea', label: 'Идея', type: 'textarea', full: true },
      { name: 'script', label: 'Сценарий', type: 'textarea', full: true },
      project,
    ],
    defaults: (s) => ({ status: 'idea', project_id: s.business_project_id ?? null }),
  },
  accounts: {
    newLabel: 'Новый счёт',
    title: 'Счёт',
    fields: [
      { name: 'name', label: 'Название', type: 'text', required: true, placeholder: 'Основная карта' },
      { name: 'kind', label: 'Тип', type: 'select', options: accountKinds },
      { name: 'initial_balance', label: 'Начальный баланс', type: 'number', suffix: 'cur' },
      { name: 'color', label: 'Цвет', type: 'color', full: true },
      { name: 'archived', label: 'Скрыть (архив)', type: 'checkbox' },
    ],
    defaults: () => ({ kind: 'card', initial_balance: 0, color: '#2c64c7' }),
  },
  transactions: {
    newLabel: 'Новая операция',
    title: 'Операция',
    fields: [
      { name: 'kind', label: 'Тип', type: 'select', options: txnKinds },
      { name: 'date', label: 'Дата', type: 'date', required: true },
      { name: 'amount', label: 'Сумма', type: 'number', required: true, suffix: 'cur', positive: true },
      { name: 'account_id', label: 'Счёт', type: 'ref', ref: 'accounts' },
      { name: 'to_account_id', label: 'На счёт', type: 'ref', ref: 'accounts', when: (v) => v.kind === 'transfer' },
      { name: 'category', label: 'Категория', type: 'text', suggest: true, when: (v) => v.kind !== 'transfer', placeholder: 'Продукты, транспорт…' },
      project,
      { name: 'note', label: 'Комментарий', type: 'text', full: true },
    ],
    defaults: () => ({ kind: 'expense', date: todayStr() }),
  },
}
