import { useEffect, useState } from 'react'
import { OUTBOX_EVENT, pendingCount } from './outbox'

/** Есть ли сеть и сколько изменений ждут отправки — для индикатора в шапке. */
export function useConnection() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    const refresh = () => pendingCount().then(setPending)
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    const onOutbox = (e: Event) => {
      const n = (e as CustomEvent<{ pending?: number }>).detail.pending
      if (typeof n === 'number') setPending(n)
      else refresh()
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener(OUTBOX_EVENT, onOutbox)
    refresh()
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener(OUTBOX_EVENT, onOutbox)
    }
  }, [])

  return { online, pending }
}
