export function createLimiter({ max, windowMs }) {
  const hits = new Map()

  const fresh = (key) => {
    const h = hits.get(key)
    if (h && Date.now() > h.until) {
      hits.delete(key)
      return null
    }
    return h
  }

  return {
    blockedFor(key) {
      const h = fresh(key)
      return h && h.count >= max ? Math.ceil((h.until - Date.now()) / 60000) : 0
    },
    hit(key) {
      const h = fresh(key)
      if (h) h.count++
      else hits.set(key, { count: 1, until: Date.now() + windowMs })
      return (h?.count ?? 1) > max
    },
    reset(key) {
      hits.delete(key)
    },
  }
}
