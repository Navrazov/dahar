import { useEffect, useState } from 'react'
import { OUTBOX_EVENT, pendingCount } from './outbox'

/** Есть ли сеть и сколько изменений ждут отправки — для индикатора в шапке. */
export function useConnection() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    let active = true
    // Другой экран может отправить общую очередь без события в этой вкладке.
    const refresh = () => pendingCount().then((n) => active && setPending(n))
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
    window.addEventListener('focus', refresh)
    const timer = setInterval(refresh, 5000)
    refresh()
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener(OUTBOX_EVENT, onOutbox)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return { online, pending }
}
