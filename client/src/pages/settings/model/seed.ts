import { addDays, setDate, subDays, subMonths } from 'date-fns'
import { api } from '@/shared/api'
import { ymd } from '@/shared/lib'

const d = (offset: number) => ymd(addDays(new Date(), offset))
const dt = (offset: number, time: string) => `${d(offset)}T${time}`
const inMonth = (m: number) => {
  const today = new Date()
  const maxDay = m === 0 ? today.getDate() : 28
  return ymd(setDate(subMonths(today, m), 1 + Math.floor(Math.random() * maxDay)))
}

export async function seedDemo() {
  const P = async (name: string, extra: object) => (await api.create('projects', { name, status: 'active', ...extra })).id
  const partnersP = await P('Развитие партнёрской сети', { area: 'Работа', color: '#2c64c7', goal: 'Выйти на 10 активных партнёров и 1 млн оборота в месяц', deadline: d(90), pinned: true })
  const perfumeP = await P('Парфюмерный бизнес', { area: 'Бизнес', color: '#e87ba4', goal: 'Стабильные 150 000 ₽ чистой прибыли в месяц', description: 'Онлайн-продажи нишевой и селективной парфюмерии через Instagram и Telegram.' })
  const tradingP = await P('Обучение трейдингу', { area: 'Учёба', color: '#1baf7a', goal: 'Пройти программу и выйти на стабильный плюс 3 месяца подряд' })
  const englishP = await P('Английский B2', { area: 'Учёба', color: '#eda100', deadline: d(180), goal: 'Свободно говорить на рабочие темы' })

  await api.setSetting('modules', {
    habits: { enabled: true }, finance: { enabled: true }, calculator: { enabled: true },
    partners: { enabled: true }, trading: { enabled: true }, business: { enabled: true, label: 'Парфюм-бизнес' },
  })
  await api.setSetting('partners_project_id', partnersP)
  await api.setSetting('business_project_id', perfumeP)
  await api.setSetting('trading_project_id', tradingP)
  await api.setSetting('currency', '₽')
  await api.setSetting('trading_currency', '$')
  await api.setSetting('trading_start_balance', 1000)

  const g1 = await api.create('goals', { title: 'Активных партнёров', project_id: partnersP, metric: 'partners_active', target_value: 10, unit: 'партнёров', deadline: d(90), status: 'active' })
  await api.create('goals', { title: 'Чистая прибыль бизнеса за месяц', project_id: perfumeP, metric: 'business_net_month', target_value: 150000, unit: '₽', deadline: d(60), status: 'active' })
  await api.create('goals', { title: 'Изучить темы программы', project_id: tradingP, metric: 'trading_topics_done', target_value: 12, unit: 'тем', status: 'active' })
  await api.create('goals', { title: 'Накопления', metric: 'finance_savings', target_value: 500000, unit: '₽', status: 'active' })
  await api.create('goals', { title: 'Прочитать книг на английском', project_id: englishP, current_value: 1, target_value: 6, unit: 'книг', status: 'active' })

  const partners = [
    { name: 'Алексей Смирнов', company: 'Финансовый брокер', status: 'active', phone: '+7 900 111-22-33', telegram: '@asmirnov', city: 'Москва', applications: 34, approvals: 21, turnover: 420000, profit: 63000, next_action: 'Обсудить повышенную ставку', next_action_date: d(0) },
    { name: 'Мария Иванова', company: 'Агентство недвижимости', status: 'first_client', city: 'Казань', applications: 6, approvals: 3, turnover: 85000, profit: 12000, next_action: 'Созвон по первому клиенту', next_action_date: d(1) },
    { name: 'ООО «Автодом»', company: 'Автосалон', status: 'terms', city: 'Екатеринбург', next_action: 'Получить ответ по условиям', next_action_date: d(-1) },
    { name: 'Дмитрий Козлов', company: 'Блогер, 120k', status: 'negotiation', telegram: '@dkozlov', next_action: 'Отправить презентацию', next_action_date: d(2) },
    { name: 'Ирина Петрова', status: 'contact', city: 'СПб', next_action: 'Позвонить повторно', next_action_date: d(3) },
    { name: 'Сергей Волков', company: 'Кредитный консультант', status: 'new' },
    { name: 'Анна Белова', company: 'Ипотечный центр', status: 'active', applications: 18, approvals: 11, turnover: 260000, profit: 39000 },
    { name: 'Олег Новиков', status: 'inactive', comment: 'Ушёл к конкурентам, вернуться через квартал' },
  ]
  const partnerIds: number[] = []
  for (const { applications, approvals, turnover, profit, ...p } of partners as any[]) {
    const id = (await api.create('partners', { ...p, project_id: partnersP } as any)).id
    partnerIds.push(id)
    if (applications) {
      for (let m = 0; m < 4; m++) {
        const share = [0.15, 0.2, 0.3, 0.35][m]
        await api.create('partner_reports', {
          partner_id: id,
          date: inMonth(3 - m),
          applications: Math.round(applications * share),
          approvals: Math.round(approvals * share),
          turnover: Math.round(turnover * share),
          profit: Math.round(profit * share),
        })
      }
    }
  }
  await api.create('partner_interactions', { partner_id: partnerIds[0], date: d(-10), type: 'meeting', note: 'Встретились, обсудили объёмы. Готов выйти на 50 заявок в месяц.' })
  await api.create('partner_interactions', { partner_id: partnerIds[0], date: d(-3), type: 'call', note: 'Просит повышенную ставку от 30 заявок.' })
  await api.create('partner_interactions', { partner_id: partnerIds[2], date: d(-5), type: 'email', note: 'Отправили условия и договор.' })

  const tasks = [
    { title: 'Позвонить потенциальному партнёру — Ирина', project_id: partnersP, partner_id: partnerIds[4], due_date: d(0), priority: 'high' },
    { title: 'Подготовить презентацию для блогеров', project_id: partnersP, partner_id: partnerIds[3], due_date: d(1), priority: 'medium', goal_id: g1.id },
    { title: 'Напомнить «Автодому» про условия', project_id: partnersP, partner_id: partnerIds[2], due_date: d(-1), priority: 'urgent' },
    { title: 'Снять 5 Reels', project_id: perfumeP, due_date: d(0), priority: 'high' },
    { title: 'Заказать партию Baccarat Rouge', project_id: perfumeP, due_date: d(2), priority: 'medium' },
    { title: 'Изучить тему Risk Management', project_id: tradingP, due_date: d(0), priority: 'medium', due_time: '20:00' },
    { title: 'Разобрать сделки недели', project_id: tradingP, due_date: d(4), priority: 'low' },
    { title: 'Урок английского', project_id: englishP, due_date: d(0), due_time: '19:00', priority: 'medium' },
    { title: 'Оплатить интернет', due_date: d(1), priority: 'low', repeat: 'monthly' },
    { title: 'Разбор сделок за день', project_id: tradingP, due_date: d(0), due_time: '21:00', priority: 'medium', repeat: 'weekdays' },
    { title: 'Отчёт по партнёрам', project_id: partnersP, due_date: d(2), priority: 'medium', repeat: 'weekly', repeat_days: [5] },
    { title: 'Обновить прайс-лист', project_id: perfumeP, status: 'done', due_date: d(-2) },
    { title: 'Созвон с Алексеем', project_id: partnersP, status: 'done', due_date: d(-3) },
  ]
  for (const t of tasks) await api.create('tasks', { status: 'todo', ...t } as any)

  const events = [
    { title: 'Встреча с Марией', start: dt(1, '11:00'), end: dt(1, '12:00'), project_id: partnersP, partner_id: partnerIds[1] },
    { title: 'Съёмка контента', start: dt(0, '15:00'), end: dt(0, '17:00'), project_id: perfumeP },
    { title: 'Вебинар: психология трейдинга', start: dt(2, '19:00'), end: dt(2, '20:30'), project_id: tradingP },
    { title: 'Speaking club', start: dt(3, '18:00'), end: dt(3, '19:00'), project_id: englishP },
    { title: 'Поставка товара', start: dt(5, '00:00'), all_day: true, project_id: perfumeP },
  ]
  for (const e of events) await api.create('events', e as any)

  const habits = [
    { name: 'Читать 30 минут', kind: 'build', frequency: 'daily', color: '#2a78d6', rate: 0.8 },
    { name: 'Изучать английский', kind: 'build', frequency: 'weekdays', days: [1, 2, 3, 4, 5], color: '#eda100', project_id: englishP, rate: 0.75 },
    { name: 'Тренировка', kind: 'build', frequency: 'weekly', per_week: 3, color: '#1baf7a', rate: 0.45 },
    { name: 'Читать Коран', kind: 'build', frequency: 'daily', color: '#4a3aa7', rate: 0.9 },
    { name: 'Без телефона после 23:00', kind: 'quit', color: '#eb6834', rate: 0.12 },
  ]
  for (const { rate, ...h } of habits) {
    const habit = await api.create('habits', { ...h, start_date: ymd(subDays(new Date(), 60)) } as any)
    for (let i = 60; i >= 1; i--) {
      const day = ymd(subDays(new Date(), i))
      const r = Math.random()
      if (h.kind === 'quit' ? r < rate : r < rate) await api.habitLog(habit.id, day, h.kind === 'quit' ? 'slip' : 'done')
    }
  }

  const topics = [
    ['Risk Management', 'Основы', 'learning'], ['Психология трейдинга', 'Основы', 'done'], ['Уровни поддержки и сопротивления', 'Теханализ', 'done'],
    ['Price Action', 'Теханализ', 'learning'], ['Объёмы', 'Теханализ', 'todo'], ['Торговый план', 'Основы', 'done'],
    ['Мани-менеджмент', 'Основы', 'done'], ['Smart Money Concepts', 'Теханализ', 'todo'], ['Фундаментальный анализ', 'Фундамент', 'todo'],
    ['Корреляции рынков', 'Фундамент', 'todo'], ['Ведение журнала', 'Основы', 'done'], ['Таймфреймы', 'Теханализ', 'todo'],
  ]
  for (const [title, category, status] of topics) await api.create('trading_topics', { title, category, status: status as any, project_id: tradingP })

  const instruments = ['BTCUSDT', 'ETHUSDT', 'EURUSD', 'XAUUSD']
  const strategies = ['Пробой уровня', 'Отбой от уровня', 'Тренд + откат']
  for (let i = 40; i >= 0; i--) {
    if (i > 1 && Math.random() < 0.45) continue
    const win = Math.random() < 0.55
    const risk = 20
    const pnl = win ? +(risk * (1 + Math.random() * 1.8)).toFixed(2) : -+(risk * (0.6 + Math.random() * 0.4)).toFixed(2)
    await api.create('trades', {
      date: d(-i), instrument: instruments[i % 4], direction: Math.random() < 0.6 ? 'long' : 'short', strategy: strategies[i % 3], risk, pnl, fees: 0.5,
      setup_reason: 'Сетап по плану', mistakes: win ? null : Math.random() < 0.5 ? 'Ранний вход' : null, project_id: tradingP,
    })
  }

  const productsData = [
    ['Baccarat Rouge 540', 'Maison Francis Kurkdjian', '70 мл', 18500, 26900, 3], ['Santal 33', 'Le Labo', '50 мл', 14200, 21500, 2],
    ['Black Opium', 'YSL', '90 мл', 7800, 12900, 6], ['Tobacco Vanille', 'Tom Ford', '50 мл', 16800, 24500, 1],
    ['Sauvage EDP', 'Dior', '100 мл', 8900, 14500, 5], ['Lost Cherry', 'Tom Ford', '50 мл', 17200, 25900, 0],
  ] as const
  const productIds: number[] = []
  for (const [name, brand, volume, purchase_price, sale_price, stock] of productsData) {
    productIds.push((await api.create('products', { name, brand, volume, purchase_price, sale_price, stock: stock + 4, project_id: perfumeP })).id)
  }
  const customerIds: number[] = []
  for (const [name, instagram] of [['Камила', '@kamila.style'], ['Руслан', '@ruslan_m'], ['Елена', '@lena.beauty'], ['Тимур', null]] as const) {
    customerIds.push((await api.create('customers', { name, instagram })).id)
  }
  for (let i = 0; i < 24; i++) {
    const pi = i % productsData.length
    const [, , , cost, price] = productsData[pi]
    await api.create('sales', { date: i < 4 ? inMonth(0) : inMonth(1 + (i % 4)), product_id: productIds[pi], customer_id: customerIds[i % 4], quantity: 1, amount: price, cost, payment_method: i % 3 ? 'Перевод' : 'Карта', project_id: perfumeP })
  }
  for (const [cat, amount, off] of [['Реклама', 15000, -1], ['Доставка', 2400, -8], ['Упаковка', 3200, -12], ['Реклама', 12000, -35], ['Пробники', 4500, -40]] as const) {
    await api.create('biz_expenses', { date: d(off), category: cat, amount, project_id: perfumeP })
  }
  const content = [
    ['Обзор Baccarat Rouge', 'published', -5], ['Топ-5 ароматов на осень', 'edited', 1], ['Как отличить оригинал', 'filmed', 3],
    ['Распаковка новой поставки', 'script', 6], ['Ароматы для офиса', 'idea', null], ['Отзывы клиентов', 'idea', null],
  ] as const
  for (const [title, status, off] of content) {
    await api.create('content', { title, status, platform: 'Instagram Reels', publish_date: off == null ? null : d(off), project_id: perfumeP })
  }

  for (const [category, amount] of [['Кафе', 5000], ['Продукты', 12000], ['Одежда', 6000], ['Транспорт', 4000]] as const) {
    await api.create('budgets', { category, amount })
  }
  const card = (await api.create('accounts', { name: 'Основная карта', kind: 'card', initial_balance: 45000, color: '#2a78d6' })).id
  const cash = (await api.create('accounts', { name: 'Наличные', kind: 'cash', initial_balance: 8000, color: '#eda100' })).id
  const save = (await api.create('accounts', { name: 'Накопительный счёт', kind: 'savings', initial_balance: 150000, color: '#1baf7a' })).id
  const inv = (await api.create('accounts', { name: 'Брокерский счёт', kind: 'investment', initial_balance: 200000, color: '#4a3aa7' })).id
  const expenseCats = [['Продукты', 9000], ['Транспорт', 3500], ['Кафе', 4000], ['Связь и подписки', 1500], ['Одежда', 6000], ['Спорт', 3000]] as const
  for (let m = 5; m >= 0; m--) {
    await api.create('transactions', { kind: 'income', date: inMonth(m), amount: 120000 + Math.round(Math.random() * 30000), category: 'Зарплата', account_id: card, project_id: null })
    await api.create('transactions', { kind: 'income', date: inMonth(m), amount: 30000 + Math.round(Math.random() * 40000), category: 'Партнёрская программа', account_id: card, project_id: partnersP })
    for (const [cat, amt] of expenseCats) {
      await api.create('transactions', { kind: 'expense', date: inMonth(m), amount: Math.round(amt * (0.6 + Math.random() * 0.9)), category: cat, account_id: Math.random() < 0.8 ? card : cash })
    }
    await api.create('transactions', { kind: 'transfer', date: inMonth(m), amount: 25000, account_id: card, to_account_id: save, note: 'Откладываю' })
    await api.create('transactions', { kind: 'transfer', date: inMonth(m), amount: 15000, account_id: card, to_account_id: inv, note: 'Пополнение брокерского счёта' })
  }
}
