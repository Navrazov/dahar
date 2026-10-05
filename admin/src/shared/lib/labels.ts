export const collectionLabels: Record<string, string> = {
  projects: 'Проекты',
  goals: 'Цели',
  partners: 'Партнёры',
  partner_reports: 'Отчёты партнёров',
  tasks: 'Задачи',
  events: 'События',
  habits: 'Привычки',
  habit_logs: 'Отметки привычек',
  partner_interactions: 'Контакты с партнёрами',
  trades: 'Сделки',
  trading_topics: 'Темы обучения',
  products: 'Товары',
  customers: 'Клиенты',
  sales: 'Продажи',
  biz_expenses: 'Расходы бизнеса',
  content: 'Контент',
  accounts: 'Счета',
  transactions: 'Операции',
  budgets: 'Бюджеты',
  reviews: 'Итоги недели',
}

export const moduleLabels: Record<string, string> = {
  habits: 'Привычки',
  finance: 'Финансы',
  calculator: 'Калькулятор',
  partners: 'Партнёры',
  trading: 'Трейдинг',
  business: 'Бизнес',
}

export const auditLabels: Record<string, string> = {
  admin_login: 'Вход в админку',
  admin_password: 'Смена пароля администратора',
  user_create: 'Создан пользователь',
  user_rename: 'Изменено имя',
  user_password: 'Сброшен пароль',
  user_block: 'Заблокирован',
  user_unblock: 'Разблокирован',
  user_sessions_end: 'Завершены сессии',
  user_delete: 'Удалён пользователь',
  errors_clear: 'Очищен журнал ошибок',
}

export function deviceOf(ua: string | null) {
  if (!ua) return 'Неизвестно'
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : ''
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /YaBrowser/.test(ua)
      ? 'Яндекс Браузер'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : ''
  return [browser, os].filter(Boolean).join(', ') || ua.slice(0, 40)
}
export const activationLabels: Record<string, string> = {
  first_task: 'Создали задачу',
  first_completion: 'Выполнили задачу',
  first_habit: 'Завели привычку',
  telegram_linked: 'Подключили Telegram',
  weekly_review_opened: 'Открыли итоги недели',
  first_review: 'Сохранили итоги недели',
  onboarding_completed: 'Завершили знакомство',
}
