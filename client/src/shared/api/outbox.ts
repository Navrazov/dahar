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
  owner: number | null
  url: string
  method: string
  body?: string
  tempId?: number
  createdAt: number
}

export type OutboxChange =
  | { kind: 'create'; table: string; row: Record<string, unknown> }
  | { kind: 'update'; table: string; row: Record<string, unknown> }
  | { kind: 'remove'; table: string; id: number }
  | { kind: 'other' }

export const OUTBOX_EVENT = 'dahar:outbox'

/** Что можно откладывать: записи коллекций, отметки привычек и настройки. Вход, файлы и импорт — только онлайн. */
const QUEUEABLE =
  /^\/api\/((?!auth|admin|files|finance|restore|backup|search|telegram|client-errors|habit-log|settings)[a-z_]+)(\/-?\d+)?$|^\/api\/(habit-log|settings\/[a-z_]+)$/

export const isQueueable = (url: string, method: string) => method !== 'GET' && idbAvailable() && QUEUEABLE.test(url)

let owner: number | null = null

/** Вызывается, когда известен вошедший пользователь (и null при выходе). */
export const setOutboxOwner = (userId: number | null) => {
  owner = userId
}

let tempSeq = 0
const newTempId = () => -(Date.now() * 100 + (tempSeq++ % 100))

const ID_MAP_KEY = 'outbox-ids'

function notify(change: OutboxChange, pending?: number) {
  window.dispatchEvent(new CustomEvent(OUTBOX_EVENT, { detail: { change, pending } }))
}

export async function pendingCount() {
  if (!idbAvailable()) return 0
  try {
    return await queue.count()
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
  const item: OutboxItem = { url, method, body, owner, createdAt: Date.now() }

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

function remapIds(text: string, ids: Map<number, number>) {
  return text.replace(/-\d{6,}/g, (s) => String(ids.get(Number(s)) ?? s))
}

let flushing: Promise<FlushResult> | null = null

export interface FlushResult {
  sent: number
  failed: { url: string; message: string }[]
  remaining: number
}

/** Отправляет очередь по порядку. Сетевая ошибка — останавливаемся и ждём; ответ 4xx — запись снимается с очереди. */
export function flushOutbox(): Promise<FlushResult> {
  flushing ??= (async () => {
    const result: FlushResult = { sent: 0, failed: [], remaining: 0 }
    if (!idbAvailable() || owner === null) return result
    const ids = new Map<number, number>(Object.entries((await kv.get<Record<string, number>>(ID_MAP_KEY)) ?? {}).map(([k, v]) => [Number(k), v]))
    const items = (await queue.all<OutboxItem>()).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    for (const item of items) {
      if (item.owner !== owner) {
        // Осталось от другого аккаунта на этом устройстве — не отправляем.
        await queue.remove(item.seq!)
        continue
      }
      const url = remapIds(item.url, ids)
      const body = item.body ? remapIds(item.body, ids) : undefined
      let res: Response
      try {
        res = await fetch(url, { method: item.method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body })
      } catch {
        break
      }
      if (res.status === 401) break
      if (res.status >= 500) break
      if (res.ok) {
        if (item.tempId !== undefined) {
          const created = await res.json().catch(() => null)
          if (created?.id) ids.set(item.tempId, created.id)
        }
        result.sent++
      } else {
        const message = (await res.json().catch(() => ({})))?.error || `Ошибка ${res.status}`
        result.failed.push({ url, message })
      }
      await queue.remove(item.seq!)
    }
    await kv.set(ID_MAP_KEY, Object.fromEntries(ids))
    result.remaining = await pendingCount()
    if (!result.remaining) await kv.del(ID_MAP_KEY)
    notify({ kind: 'other' }, result.remaining)
    return result
  })().finally(() => {
    flushing = null
  })
  return flushing
}
