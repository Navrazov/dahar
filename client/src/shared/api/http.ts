import { enqueue, isQueueable } from './outbox'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export const AUTH_EXPIRED_EVENT = 'auth:expired'

/** Мини-приложение Telegram ходит с токеном в заголовке: во фрейме Telegram cookie не работают. */
let authToken: string | null = null
export const setAuthToken = (token: string | null) => {
  authToken = token
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || 'GET').toUpperCase()
  const queueable = isQueueable(url, method)
  if (queueable && !navigator.onLine) return enqueue<T>(url, init ?? {})

  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    })
  } catch (e) {
    // Сеть пропала посреди запроса — изменение не теряем, а откладываем.
    if (queueable) return enqueue<T>(url, init ?? {})
    throw new ApiError(0, 'Нет связи с сервером')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    if (res.status === 401 && !url.startsWith('/api/auth/')) window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
    throw new ApiError(res.status, body.error || `Ошибка ${res.status}`)
  }
  return res.json()
}

export const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })
