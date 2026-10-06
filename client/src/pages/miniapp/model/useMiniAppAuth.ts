import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError, AUTH_EXPIRED_EVENT, setAuthToken, setOutboxOwner, setOutboxDataset, type User } from '@/shared/api'
import { SESSION_ENDED_EVENT } from '@/entities/session'
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
  const qc = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [state, setState] = useState<AuthState>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (state !== 'ready') return
    const expired = () => {
      setAuthToken(null)
      store.set(null)
      setOutboxOwner(null)
      setOutboxDataset(undefined)
      void qc.cancelQueries()
      qc.clear()
      setUser(null)
      setState('loading')
      setAttempt((a) => a + 1)
    }
    const ended = () => {
      setAuthToken(null)
      store.set(null)
      setOutboxOwner(null)
      setOutboxDataset(undefined)
      setUser(null)
      setState(webApp() ? 'not_linked' : 'outside')
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, expired)
    window.addEventListener(SESSION_ENDED_EVENT, ended)
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, expired)
      window.removeEventListener(SESSION_ENDED_EVENT, ended)
    }
  }, [state, qc])

  useEffect(() => {
    let cancelled = false
    const done = (s: AuthState) => !cancelled && setState(s)
    const app = webApp()

    async function accept(next: User, token: string | null) {
      if (cancelled) return
      await qc.cancelQueries()
      if (cancelled) return
      qc.clear()
      setAuthToken(token)
      setOutboxOwner(next.id)
      setOutboxDataset(next.dataset_version)
      if (token) store.set(token)
      await qc.fetchQuery({ queryKey: ['settings'], queryFn: api.settings, staleTime: 0 })
      if (cancelled) return
      setUser(next)
      done('ready')
    }

    async function run() {
      // Открыли не из Telegram (например, при разработке) — пробуем обычную сессию браузера.
      if (!app) {
        try {
          const { user } = await api.me()
          await accept(user, null)
          return
        } catch (e) {
          return done(e instanceof ApiError && e.status === 401 ? 'outside' : 'error')
        }
      }
      setAuthToken(store.get())
      try {
        const { token, user } = await api.telegramWebApp(app.initData)
        // повторный запуск эффекта уже выдал новый токен, а этот сервер удалит — не трогаем
        if (cancelled) return
        await accept(user, token)
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
  }, [attempt, qc])

  return {
    state,
    user,
    retry: () => {
      setState('loading')
      setAttempt((a) => a + 1)
    },
  }
}
