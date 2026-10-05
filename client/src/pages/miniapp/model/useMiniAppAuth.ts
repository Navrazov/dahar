import { useEffect, useState } from 'react'
import { api, ApiError, setAuthToken } from '@/shared/api'
import { webApp } from '@/shared/lib'

export type AuthState = 'loading' | 'ready' | 'not_linked' | 'outside' | 'error'

const KEY = 'tg-token'
const store = {
  get: () => {
    try {
      return localStorage.getItem(KEY)
    } catch {
      return null
    }
  },
  set: (v: string | null) => {
    try {
      if (v) localStorage.setItem(KEY, v)
      else localStorage.removeItem(KEY)
    } catch {}
  },
}

/**
 * Вход по подписи Telegram при каждом открытии: так отвязка в настройках срабатывает сразу.
 * Прежний токен устройства уходит вместе с запросом, и сервер его удаляет — сессии не копятся.
 */
export function useMiniAppAuth() {
  const [state, setState] = useState<AuthState>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const done = (s: AuthState) => !cancelled && setState(s)
    const app = webApp()

    async function run() {
      // Открыли не из Telegram (например, при разработке) — пробуем обычную сессию браузера.
      if (!app) {
        try {
          await api.me()
          return done('ready')
        } catch {
          return done('outside')
        }
      }
      setAuthToken(store.get())
      try {
        const { token } = await api.telegramWebApp(app.initData)
        // повторный запуск эффекта уже выдал новый токен, а этот сервер удалит — не трогаем
        if (cancelled) return
        setAuthToken(token)
        store.set(token)
        done('ready')
      } catch (e) {
        if (cancelled) return
        setAuthToken(null)
        if (e instanceof ApiError && (e.status === 403 || e.status === 401)) store.set(null)
        if (e instanceof ApiError && e.status === 403) return done('not_linked')
        if (e instanceof ApiError && e.status === 401) return done('outside')
        done('error')
      }
    }

    run().finally(() => app?.ready())
    return () => {
      cancelled = true
    }
  }, [attempt])

  return {
    state,
    retry: () => {
      setState('loading')
      setAttempt((a) => a + 1)
    },
  }
}
