import { useQueryClient } from '@tanstack/react-query'
import { api, flushOutbox } from '@/shared/api'
import { wipeLocalData } from '@/shared/lib'
import { signOutLocally } from '@/entities/session'

export function useLogout() {
  const qc = useQueryClient()
  return async () => {
    // Сначала пытаемся отправить отложенное, затем стираем всё, что лежит на устройстве.
    await flushOutbox().catch(() => {})
    await api.logout().catch(() => {})
    signOutLocally(qc)
    await wipeLocalData()
  }
}
