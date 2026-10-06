import { useEffect, useRef, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, AUTH_EXPIRED_EVENT, setOutboxDataset, setOutboxOwner } from '@/shared/api'
import { Button, LogoMark, Spinner } from '@/shared/ui'
import { ME_KEY, signOutLocally, UserContext } from '@/entities/session'
import { LoginPage } from '@/pages/login'

export function AuthGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const verified = useRef(false)
  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: () =>
      api
        .me()
        .then((r) => {
          const previous = qc.getQueryData<{ id: number; dataset_version?: number } | null>(ME_KEY)
          if (previous?.id !== r.user.id || previous?.dataset_version !== r.user.dataset_version) {
            void qc.cancelQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] })
            qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] })
          }
          verified.current = true
          setOutboxOwner(r.user.id)
          setOutboxDataset(r.user.dataset_version)
          return r.user
        })
        .catch((e) => (e instanceof ApiError && e.status === 401 ? null : Promise.reject(e))),
    // Сохранённый на устройстве ответ показываем без сети, но при каждом запуске перепроверяем сессию.
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: false,
  })

  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key !== 'dahar-session-change') return
      verified.current = false
      setOutboxOwner(null)
      void qc.cancelQueries()
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] })
      qc.setQueryData(ME_KEY, null)
      void qc.invalidateQueries({ queryKey: ME_KEY })
    }
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [qc])

  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings, enabled: !!me.data && (me.isFetchedAfterMount || !navigator.onLine) })

  const userId = me.data?.id ?? null
  useEffect(() => {
    setOutboxOwner(userId)
    setOutboxDataset(me.data?.dataset_version)
  }, [userId, me.data?.dataset_version])

  useEffect(() => {
    const onExpired = () => signOutLocally(qc)
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
  }, [qc])

  if (me.isPending && me.fetchStatus === 'paused') {
    return (
      <div className="flex min-h-screen animate-[fade-in_300ms_ease-out] flex-col items-center justify-center bg-bg px-4 text-center">
        <LogoMark size={36} />
        <p className="mt-5 text-[14px] text-fg-2">Нет сети. На этом устройстве ещё нет сохранённых данных — подключитесь к интернету один раз.</p>
      </div>
    )
  }
  if (
    (me.data && settings.isPending) ||
    me.isPending ||
    (navigator.onLine && !me.isFetchedAfterMount && me.isFetching) ||
    (me.data === null && me.isFetching)
  ) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bg animate-[fade-in_400ms_ease-out_150ms_both]">
        <LogoMark size={36} />
        <Spinner size={18} className="text-fg-3" />
      </div>
    )
  }
  if ((me.isError && (!me.data || (navigator.onLine && !verified.current))) || (settings.isError && !settings.data && me.data)) {
    return (
      <div className="flex min-h-screen animate-[fade-in_300ms_ease-out] flex-col items-center justify-center bg-bg px-4 text-center">
        <p className="text-[14px] text-fg-2">Сервер не отвечает.</p>
        <Button
          className="mt-4"
          loading={me.isFetching}
          onClick={() => {
            void me.refetch()
            void settings.refetch()
          }}
        >
          Повторить
        </Button>
      </div>
    )
  }
  // Сессию не удалось перепроверить (нет связи), но пользователь сохранён на устройстве — работаем на кэше.
  if (!me.data) return <LoginPage />
  return <UserContext.Provider value={me.data}>{children}</UserContext.Provider>
}
