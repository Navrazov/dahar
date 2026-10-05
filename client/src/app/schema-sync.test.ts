import { describe, expect, it } from 'vitest'
import { enumValues } from '@dahar/shared'
import { contentStatuses } from '@/entities/business'
import { accountKinds, txnKinds } from '@/entities/finance'
import { goalMetrics, goalStatuses } from '@/entities/goal'
import { habitFrequencies, habitKinds } from '@/entities/habit'
import { interactionTypes, partnerStatuses } from '@/entities/partner'
import { projectStatuses } from '@/entities/project'
import { priorities, repeatOptions, taskStatuses } from '@/entities/task'
import { directions, topicStatuses } from '@/entities/trade'
import type { Option } from '@/shared/lib'

// Подписи живут в клиенте, допустимые значения — в общей схеме. Тест не даёт им разойтись:
// иначе форма предложит значение, которое сервер отклонит.
const cases: [string, Option[], readonly string[]][] = [
  ['projects.status', projectStatuses, enumValues('projects', 'status')],
  ['goals.status', goalStatuses, enumValues('goals', 'status')],
  ['tasks.status', taskStatuses, enumValues('tasks', 'status')],
  ['tasks.priority', priorities, enumValues('tasks', 'priority')],
  ['tasks.repeat', repeatOptions, enumValues('tasks', 'repeat')],
  ['habits.kind', habitKinds, enumValues('habits', 'kind')],
  ['habits.frequency', habitFrequencies, enumValues('habits', 'frequency')],
  ['partners.status', partnerStatuses, enumValues('partners', 'status')],
  ['partner_interactions.type', interactionTypes, enumValues('partner_interactions', 'type')],
  ['trades.direction', directions, enumValues('trades', 'direction')],
  ['trading_topics.status', topicStatuses, enumValues('trading_topics', 'status')],
  ['content.status', contentStatuses, enumValues('content', 'status')],
  ['accounts.kind', accountKinds, enumValues('accounts', 'kind')],
  ['transactions.kind', txnKinds, enumValues('transactions', 'kind')],
]

describe('client options match the shared schema', () => {
  it.each(cases)('%s', (_name, options, allowed) => {
    const values = options.map((o) => o.value).filter((v) => v !== '')
    expect([...values].sort()).toEqual([...allowed].sort())
  })

  it('goal metrics fit the metric column', () => {
    for (const m of goalMetrics) expect(m.value.length).toBeLessThanOrEqual(60)
  })
})
