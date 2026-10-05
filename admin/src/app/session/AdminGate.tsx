import { useEffect, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, UNAUTHORIZED_EVENT } from '@/shared/api'
import { AdminContext, ME_KEY, signOutLocally } from '@/entities/session'
import { QueryState } from '@/shared/ui'
import { LoginPage } from '@/pages/login'

export function AdminGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: () =>
      api
        .me()
        .then((r) => r.admin)
        .catch((e) => (e instanceof ApiError && e.status === 401 ? null : Promise.reject(e))),
    staleTime: Infinity,
    retry: false,
  })

  useEffect(() => {
    const onExpired = () => signOutLocally(qc)
    window.addEventListener(UNAUTHORIZED_EVENT, onExpired)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onExpired)
  }, [qc])

  if (me.isPending || me.isError)
    return (
      <main className="mx-auto max-w-4xl p-6">
        <QueryState query={me} title="Вход в админку" />
      </main>
    )
  if (!me.data) return <LoginPage />
  return <AdminContext.Provider value={me.data}>{children}</AdminContext.Provider>
}
