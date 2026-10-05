export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export const AUTH_EXPIRED_EVENT = 'auth:expired'

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    if (res.status === 401 && !url.startsWith('/api/auth/')) window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
    throw new ApiError(res.status, body.error || `Ошибка ${res.status}`)
  }
  return res.json()
}

export const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })
