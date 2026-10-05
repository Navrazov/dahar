import { useEffect, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, AUTH_EXPIRED_EVENT, setOutboxOwner } from '@/shared/api'
import { Button, LogoMark, Spinner } from '@/shared/ui'
import { ME_KEY, signOutLocally, UserContext } from '@/entities/session'
import { LoginPage } from '@/pages/login'

export function AuthGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: () =>
      api
        .me()
        .then((r) => r.user)
        .catch((e) => (e instanceof ApiError && e.status === 401 ? null : Promise.reject(e))),
    // Сохранённый на устройстве ответ показываем без сети, но при каждом запуске перепроверяем сессию.
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  })

  const userId = me.data?.id ?? null
  useEffect(() => setOutboxOwner(userId), [userId])

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
  if (me.isPending || (me.data === null && me.isFetching)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bg animate-[fade-in_400ms_ease-out_150ms_both]">
        <LogoMark size={36} />
        <Spinner size={18} className="text-fg-3" />
      </div>
    )
  }
  if (me.isError && !me.data) {
    return (
      <div className="flex min-h-screen animate-[fade-in_300ms_ease-out] flex-col items-center justify-center bg-bg px-4 text-center">
        <p className="text-[14px] text-fg-2">Сервер не отвечает.</p>
        <Button className="mt-4" loading={me.isFetching} onClick={() => me.refetch()}>
          Повторить
        </Button>
      </div>
    )
  }
  // Сессию не удалось перепроверить (нет связи), но пользователь сохранён на устройстве — работаем на кэше.
  if (!me.data) return <LoginPage />
  return <UserContext.Provider value={me.data}>{children}</UserContext.Provider>
}
