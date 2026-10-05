const expense: Record<string, string> = {
  супермаркеты: 'Продукты',
  продукты: 'Продукты',
  рестораны: 'Кафе',
  фастфуд: 'Кафе',
  'рестораны и кафе': 'Кафе',
  кафе: 'Кафе',
  транспорт: 'Транспорт',
  'местный транспорт': 'Транспорт',
  такси: 'Транспорт',
  каршеринг: 'Транспорт',
  топливо: 'Авто',
  автоуслуги: 'Авто',
  автомобиль: 'Авто',
  'аренда авто': 'Авто',
  'ж/д билеты': 'Путешествия',
  авиабилеты: 'Путешествия',
  отели: 'Путешествия',
  турагентства: 'Путешествия',
  путешествия: 'Путешествия',
  аптеки: 'Здоровье',
  медицина: 'Здоровье',
  здоровье: 'Здоровье',
  'здоровье и красота': 'Здоровье',
  красота: 'Красота',
  'одежда и обувь': 'Одежда',
  'одежда и аксессуары': 'Одежда',
  'мобильная связь': 'Связь',
  связь: 'Связь',
  интернет: 'Связь',
  'коммунальные услуги': 'ЖКХ',
  жкх: 'ЖКХ',
  'коммунальные платежи, связь, интернет': 'ЖКХ и связь',
  развлечения: 'Развлечения',
  кино: 'Развлечения',
  музыка: 'Развлечения',
  'отдых и развлечения': 'Развлечения',
  'цифровые товары': 'Подписки',
  'дом и ремонт': 'Дом',
  'все для дома': 'Дом',
  мебель: 'Дом',
  животные: 'Животные',
  образование: 'Образование',
  книги: 'Образование',
  спорттовары: 'Спорт',
  спорт: 'Спорт',
  маркетплейсы: 'Покупки',
  'электроника и техника': 'Техника',
  цветы: 'Подарки',
  подарки: 'Подарки',
  наличные: 'Наличные',
  'выдача наличных': 'Наличные',
  переводы: 'Переводы',
  'перевод с карты': 'Переводы',
  'перевод на карту': 'Переводы',
  'перевод сбп': 'Переводы',
  госуслуги: 'Налоги и сборы',
  штрафы: 'Налоги и сборы',
  другое: '',
  'прочие операции': '',
  'прочие расходы': '',
}

const income: Record<string, string> = {
  пополнения: 'Пополнения',
  'внесение наличных': 'Пополнения',
  зарплата: 'Зарплата',
  'заработная плата': 'Зарплата',
  проценты: 'Проценты',
  капитализация: 'Проценты',
  кэшбэк: 'Кэшбэк',
  бонусы: 'Кэшбэк',
  'возврат, отмена операций': 'Возвраты',
  возвраты: 'Возвраты',
  переводы: 'Переводы',
  'перевод на карту': 'Переводы',
  'перевод с карты': 'Переводы',
  'перевод сбп': 'Переводы',
  другое: '',
  'прочие операции': '',
  'прочие поступления': '',
}

const norm = (s: unknown) =>
  String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()

const ownTransfer = /перевод|пополнен|сбп|между (своими )?счетами|с карты|на карту|внесение/i

export function merchantKey(description: unknown) {
  return String(description || '')
    .toUpperCase()
    .replace(/Ё/g, 'Е')
    .replace(/[*#№]\S*/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/\d/.test(w))
    .slice(0, 4)
    .join(' ')
    .replace(/[.,;:]+$/, '')
}

interface Describable {
  bank_category?: string | null
  description?: string | null
  category?: string | null
  note?: string | null
}

export function isTransferLike(row: Describable) {
  return (
    ownTransfer.test(row.bank_category || '') ||
    ownTransfer.test(row.description || '') ||
    ownTransfer.test(row.category || '') ||
    ownTransfer.test(row.note || '')
  )
}

export function suggestCategory(row: { kind: string; description: string; bank_category: string }, rules: Map<string, string>, known: Map<string, string>) {
  const fromRule = rules.get(`${row.kind}:${merchantKey(row.description)}`)
  if (fromRule != null) return fromRule
  const dict = row.kind === 'income' ? income : expense
  const key = norm(row.bank_category)
  const mapped = key in dict ? dict[key] : (row.bank_category || '').trim().replace(/\.$/, '')
  if (!mapped) return ''
  return known.get(norm(mapped)) ?? mapped
}

export const knownCategories = (names: string[]) => new Map(names.filter(Boolean).map((n): [string, string] => [norm(n), n]))
