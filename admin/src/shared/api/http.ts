export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export const UNAUTHORIZED_EVENT = 'admin:unauthorized'

export async function request<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  let res: Response
  try {
    res = await fetch(`/api/admin${url}`, {
      ...rest,
      credentials: 'same-origin',
      headers: json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      signal:
        (rest.method || 'GET') === 'GET'
          ? rest.signal
            ? AbortSignal.any([rest.signal, AbortSignal.timeout(15_000)])
            : AbortSignal.timeout(15_000)
          : rest.signal,
    })
  } catch (e) {
    if (rest.signal?.aborted) throw e
    throw new ApiError(0, 'Сервер не ответил. Проверьте соединение и попробуйте снова')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    if (res.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    throw new ApiError(res.status, body.error || `Ошибка ${res.status}`)
  }
  return res.json()
}
