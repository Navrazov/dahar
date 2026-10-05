interface Hit {
  count: number
  until: number
}

/** Счётчик попыток в памяти процесса. Подходит для одного экземпляра сервиса. */
export function createLimiter({ max, windowMs }: { max: number; windowMs: number }) {
  const hits = new Map<string, Hit>()
  let lastSweep = Date.now()

  const sweep = () => {
    const now = Date.now()
    if (now - lastSweep < windowMs) return
    lastSweep = now
    for (const [key, h] of hits) if (now > h.until) hits.delete(key)
  }

  const fresh = (key: string) => {
    const h = hits.get(key)
    if (h && Date.now() > h.until) {
      hits.delete(key)
      return null
    }
    return h ?? null
  }

  return {
    /** Сколько минут ждать, если лимит исчерпан, иначе 0. */
    blockedFor(key: string) {
      const h = fresh(key)
      return h && h.count >= max ? Math.ceil((h.until - Date.now()) / 60000) : 0
    },
    hit(key: string) {
      sweep()
      const h = fresh(key)
      if (h) h.count++
      else hits.set(key, { count: 1, until: Date.now() + windowMs })
      return (h?.count ?? 1) > max
    },
    reset(key: string) {
      hits.delete(key)
    },
    size: () => hits.size,
  }
}
