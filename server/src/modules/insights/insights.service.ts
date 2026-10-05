import Anthropic from '@anthropic-ai/sdk'
import { config } from '../../config.ts'
import { query } from '../../db/pool.ts'
import { HttpError, badRequest } from '../../lib/errors.ts'
import { createLimiter } from '../../lib/rate-limit.ts'
import { collectWeek, isEmptyWeek, type WeekData } from './week-data.ts'

export const INSIGHTS_MODEL = 'claude-opus-5-5'

/** Разбор недели в том виде, в каком его показывает страница «Итоги недели». */
export interface WeeklyInsight {
  summary: string
  wins: string[]
  attention: string[]
  money: string
  habits: string
  next_week: string[]
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'wins', 'attention', 'money', 'habits', 'next_week'],
  properties: {
    summary: { type: 'string', description: 'Два-три предложения: какой была неделя в целом' },
    wins: { type: 'array', items: { type: 'string' }, description: 'Что получилось — конкретно, со ссылкой на задачи и цифры' },
    attention: { type: 'array', items: { type: 'string' }, description: 'Что просело или застряло: просрочки, сорванные привычки, траты сверх обычного' },
    money: { type: 'string', description: 'Куда ушли деньги и чем неделя отличается от прошлой' },
    habits: { type: 'string', description: 'Как шли привычки' },
    next_week: { type: 'array', items: { type: 'string' }, description: 'Три конкретных шага на следующую неделю' },
  },
} as const

// Неизменная часть запроса — первой и с отметкой кэша; данные недели идут после.
const SYSTEM = `Ты — внимательный помощник по личной продуктивности в приложении Dahar. По данным одной недели пользователя ты пишешь короткий честный разбор на русском языке.

Правила:
- Опирайся только на данные из запроса. Не выдумывай задачи, суммы и события. Если данных по разделу нет — так и скажи одной фразой.
- Пиши по-человечески, на «ты», без канцелярита и без мотивационных штампов.
- Называй конкретику: названия задач и проектов, категории расходов, цифры с валютой пользователя.
- В «Что просело» — без упрёков: что произошло и почему это может мешать.
- Шаги на следующую неделю — выполнимые и проверяемые, связанные с увиденным в данных.
- Каждый пункт списка — одно предложение.`

let client: Anthropic | null = null
const anthropic = () => (client ??= new Anthropic({ apiKey: config.anthropicApiKey ?? undefined, maxRetries: 2, timeout: 60_000 }))

export const insightsEnabled = () => !!config.anthropicApiKey

/** Обращение к модели вынесено, чтобы в тестах подставлять заглушку. */
export type Generate = (week: WeekData) => Promise<WeeklyInsight>

export const generateWithClaude: Generate = async (week) => {
  let response: Anthropic.Beta.BetaMessage
  try {
    response = await anthropic().beta.messages.create({
      model: INSIGHTS_MODEL,
      max_tokens: 4000,
      // Задача несложная: низкое усилие заметно дешевле и для такого разбора достаточно.
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      // Если классификатор безопасности отклонит запрос, сервер сам повторит его на подходящей модели.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Данные недели в JSON:\n${JSON.stringify(week)}` }],
    })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, 'Сервис разбора сейчас перегружен. Попробуйте через минуту')
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, 'Разбор недели не настроен: неверный ключ ANTHROPIC_API_KEY')
    if (e instanceof Anthropic.APIConnectionError) throw new HttpError(503, 'Не удалось связаться с сервисом разбора')
    if (e instanceof Anthropic.APIError && (e.status ?? 0) >= 500) throw new HttpError(503, 'Сервис разбора временно недоступен')
    throw e
  }
  if (response.stop_reason === 'refusal') throw new HttpError(422, 'Модель отказалась разбирать эту неделю')
  if (response.stop_reason === 'max_tokens') throw new HttpError(502, 'Разбор получился слишком длинным, попробуйте ещё раз')
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  const parsed = JSON.parse(text) as WeeklyInsight
  return parsed
}

export async function getInsight(userId: number, weekStart: string) {
  const { rows } = await query<{ content: WeeklyInsight; created_at: Date }>(
    'SELECT content, created_at FROM weekly_insights WHERE user_id = $1 AND week_start = $2',
    [userId, weekStart],
  )
  return rows[0] ? { ...rows[0].content, created_at: rows[0].created_at } : null
}

/** Не больше нескольких разборов в день на человека: каждый стоит денег. */
const daily = createLimiter({ max: 10, windowMs: 24 * 60 * 60 * 1000 })

export async function createInsight(userId: number, weekStart: string, generate: Generate = generateWithClaude) {
  const week = await collectWeek(userId, weekStart)
  if (isEmptyWeek(week)) throw badRequest('За эту неделю пока нечего разбирать: нет задач, отметок привычек и операций')
  if (daily.hit(String(userId))) throw new HttpError(429, 'На сегодня лимит разборов исчерпан, загляните завтра')
  const content = await generate(week)
  await query(
    `INSERT INTO weekly_insights (user_id, week_start, content, model) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, week_start) DO UPDATE SET content = excluded.content, model = excluded.model, created_at = now()`,
    [userId, weekStart, JSON.stringify(content), INSIGHTS_MODEL],
  )
  return getInsight(userId, weekStart)
}
