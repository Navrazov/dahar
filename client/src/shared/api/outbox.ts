import { tableOrder } from '@dahar/shared'
import { idbAvailable, kv, queue } from '../lib/idb'

/**
 * Офлайн-очередь изменений. Без сети запись не теряется: запрос откладывается в IndexedDB,
 * а интерфейс сразу получает правдоподобный ответ. При появлении сети очередь уходит по порядку.
 * Новые записи получают временный отрицательный id; после отправки он заменяется настоящим —
 * и в адресах, и в ссылках из других отложенных записей.
 */

export interface OutboxItem {
  seq?: number
  /** Чьё это изменение: очередь одного пользователя никогда не уходит в чужой аккаунт. */
  datasetVersion?: number
  owner: number | null
  url: string
  method: string
  body?: string
  tempId?: number
  operationKey: string
  error?: string
  createdAt: number
}

export type OutboxChange =
  | { kind: 'create'; table: string; row: Record<string, unknown> }
  | { kind: 'update'; table: string; row: Record<string, unknown> }
  | { kind: 'remove'; table: string; id: number }
  | { kind: 'other' }

export const OUTBOX_EVENT = 'dahar:outbox'

/** Что можно откладывать: записи коллекций, отметки привычек и настройки. Вход, файлы и импорт — только онлайн. */
let offlineEnabled = true
export const setOfflineEnabled = (enabled: boolean) => {
  offlineEnabled = enabled
}
const QUEUEABLE =
  /^\/api\/((?!auth|admin|files|finance|restore|backup|search|telegram|client-errors|habit-log|settings)[a-z_]+)(\/-?\d+)?$|^\/api\/(habit-log|settings\/[a-z_]+)$/

export const isQueueable = (url: string, method: string) =>
  offlineEnabled &&
  owner !== null &&
  method !== 'GET' &&
  idbAvailable() &&
  ((QUEUEABLE.test(url) && (tableOrder.includes(url.split('/')[2] as never) || url.startsWith('/api/settings/') || url === '/api/habit-log')) ||
    url === '/api/tasks/bulk')

let datasetVersion: number | undefined = 1
export const setOutboxDataset = (value: number | undefined) => {
  datasetVersion = value
}
export const getOutboxDataset = () => datasetVersion
let owner: number | null = null

/** Вызывается, когда известен вошедший пользователь (и null при выходе). */
export const setOutboxOwner = (userId: number | null) => {
  owner = userId
}

export const getOutboxOwner = () => owner

let tempSeq = 0
const newTempId = () => -(Date.now() * 100 + (tempSeq++ % 100))

const ID_MAP_KEY = 'outbox-ids'

function notify(change: OutboxChange, pending?: number) {
  window.dispatchEvent(new CustomEvent(OUTBOX_EVENT, { detail: { change, pending } }))
}

export async function pendingCount() {
  if (!idbAvailable()) return 0
  try {
    return (await queue.all<OutboxItem>()).filter((x) => !x.error && x.owner === owner).length
  } catch {
    return 0
  }
}

/** Откладывает запрос и возвращает ответ, который вернул бы сервер. */
export async function enqueue<T>(url: string, init: RequestInit): Promise<T> {
  const method = (init.method || 'GET').toUpperCase()
  const body = typeof init.body === 'string' ? init.body : undefined
  const data = body ? (JSON.parse(body) as Record<string, unknown>) : {}
  const m = /^\/api\/([a-z_]+)(?:\/(-?\d+))?$/.exec(url)
  const table = m?.[1] ?? ''
  const id = m?.[2] ? Number(m[2]) : undefined
  const item: OutboxItem = {
    url,
    method,
    body,
    owner,
    datasetVersion,
    operationKey: new Headers(init.headers).get('Idempotency-Key') || crypto.randomUUID(),
    createdAt: Date.now(),
  }

  let result: unknown = { ok: true }
  let change: OutboxChange = { kind: 'other' }
  if (method === 'POST' && m && id === undefined) {
    item.tempId = newTempId()
    const row = { ...data, id: item.tempId, created_at: new Date().toISOString(), _pending: true }
    result = row
    change = { kind: 'create', table, row }
  } else if (method === 'PATCH' && id !== undefined) {
    const row = { ...data, id, _pending: true }
    result = row
    change = { kind: 'update', table, row }
  } else if (method === 'DELETE' && id !== undefined) {
    change = { kind: 'remove', table, id }
  }

  await queue.add(item)
  notify(change, await pendingCount())
  return result as T
}

/** Only identity fields are remapped; descriptions and negative amounts are untouched. */
export function remapBody(body: string | undefined, ids: Map<number, number>) {
  if (!body) return undefined
  const data = JSON.parse(body) as Record<string, unknown>
  for (const [key, value] of Object.entries(data))
    if ((key === 'id' || key.endsWith('_id')) && typeof value === 'number' && ids.has(value)) data[key] = ids.get(value)
  if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) data.data = JSON.parse(remapBody(JSON.stringify(data.data), ids)!)
  if (Array.isArray(data.ids)) data.ids = data.ids.map((id) => (typeof id === 'number' ? (ids.get(id) ?? id) : id))
  return JSON.stringify(data)
}

let flushing: Promise<FlushResult> | null = null
export interface FlushResult {
  sent: number
  failed: { url: string; message: string }[]
  remaining: number
}
export async function failedChanges() {
  return (await queue.all<OutboxItem>()).filter((x) => x.owner === owner && x.error)
}
export async function retryChange(seq: number, body?: string) {
  const item = (await failedChanges()).find((x) => x.seq === seq)
  if (!item) return
  await queue.put({ ...item, error: undefined, ...(body ? { body } : {}) })
  notify({ kind: 'other' }, await pendingCount())
}
export async function discardChange(seq: number) {
  const item = (await failedChanges()).find((x) => x.seq === seq)
  if (item) await queue.remove(seq)
  notify({ kind: 'other' }, await pendingCount())
}

export function flushOutbox(): Promise<FlushResult> {
  if (flushing) return flushing
  const run = async () => {
    const result: FlushResult = { sent: 0, failed: [], remaining: 0 }
    const user = owner
    if (!idbAvailable() || user === null) return result
    const mapKey = `${ID_MAP_KEY}:${user}`
    const ids = new Map<number, number>(Object.entries((await kv.get<Record<string, number>>(mapKey)) ?? {}).map(([k, v]) => [Number(k), v]))
    for (const item of (await queue.all<OutboxItem>()).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
      if (item.owner !== user) continue
      if (item.error) break
      if (owner !== user) break
      if (Date.now() - item.createdAt > 28 * 86400000 || (item.datasetVersion === undefined && datasetVersion !== 1)) {
        const message = 'Изменение слишком старое или создано до восстановления данных. Проверьте его вручную'
        await queue.put({ ...item, error: message })
        result.failed.push({ url: item.url, message })
        break
      }
      const url = item.url.replace(/\/(-\d+)$/, (_m, id: string) => `/${ids.get(Number(id)) ?? id}`)
      let body = remapBody(item.body, ids)
      if (body && (/^\/api\/settings\/[a-z_]+_project_id$/.test(item.url) || item.url === '/api/settings/default_account_id')) {
        const data = JSON.parse(body)
        if (typeof data.value === 'number') data.value = ids.get(data.value) ?? data.value
        body = JSON.stringify(data)
      }
      let res: Response
      try {
        res = await fetch(url, {
          method: item.method,
          credentials: 'same-origin',
          headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            'X-Dahar-User': String(user),
            'X-Dahar-Dataset': String(item.datasetVersion ?? 1),
            'Idempotency-Key': item.operationKey || `legacy-${user}-${item.seq}-${item.createdAt}`,
          },
          body,
          signal: AbortSignal.timeout(15000),
        })
      } catch {
        break
      }
      if (res.status === 401) {
        if (owner === user) window.dispatchEvent(new Event('auth:expired'))
        break
      }
      if (res.status === 429 || res.status >= 500) break
      if (res.ok) {
        if (item.tempId !== undefined) {
          const row = await res.json().catch(() => null)
          if (row?.id) ids.set(item.tempId, row.id)
        }
        // Mapping and removal must commit together, even if a tab crashes between requests.
        await queue.complete(item.seq!, mapKey, Object.fromEntries(ids))
        result.sent++
      } else {
        const message = (await res.json().catch(() => ({})))?.error || `Ошибка ${res.status}`
        await queue.put({ ...item, error: message })
        result.failed.push({ url, message })
        // Dependent operations stay intact until this one is corrected or discarded.
        break
      }
    }
    result.remaining = await pendingCount()
    notify({ kind: 'other' }, result.remaining)
    return result
  }
  const locked = () => (navigator.locks ? navigator.locks.request('dahar-outbox', run) : queue.withLease(run))
  flushing = locked().finally(() => {
    flushing = null
  })
  return flushing
}
