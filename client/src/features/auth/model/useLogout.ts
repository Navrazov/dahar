import { useQueryClient } from '@tanstack/react-query'
import { api, flushOutbox, pendingCount, failedChanges } from '@/shared/api'
import { wipeLocalData } from '@/shared/lib'
import { signOutLocally } from '@/entities/session'

export function useLogout() {
  const qc = useQueryClient()
  return async () => {
    // Сначала пытаемся отправить отложенное, затем стираем всё, что лежит на устройстве.
    await flushOutbox().catch(() => {})
    if (
      ((await pendingCount()) || (await failedChanges()).length) &&
      !window.confirm('Есть несохранённые изменения. При выходе они будут удалены с этого устройства. Выйти?')
    )
      return
    await api.logout().catch(() => {})
    signOutLocally(qc)
    await wipeLocalData()
  }
}
