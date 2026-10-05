import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'
import { signOutLocally } from '@/entities/session'

export function useLogout() {
  const qc = useQueryClient()
  return async () => {
    await api.logout().catch(() => {})
    signOutLocally(qc)
  }
}
