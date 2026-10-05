import { useEffect, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, AUTH_EXPIRED_EVENT } from '@/shared/api'
import { Button } from '@/shared/ui'
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
    staleTime: Infinity,
    retry: false,
  })

  useEffect(() => {
    const onExpired = () => signOutLocally(qc)
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
  }, [qc])

  if (me.isPending) return <div className="min-h-screen bg-bg" />
  if (me.isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 text-center">
        <p className="text-[14px] text-fg-2">Сервер не отвечает.</p>
        <Button className="mt-4" onClick={() => me.refetch()}>
          Повторить
        </Button>
      </div>
    )
  }
  if (!me.data) return <LoginPage />
  return <UserContext.Provider value={me.data}>{children}</UserContext.Provider>
}
