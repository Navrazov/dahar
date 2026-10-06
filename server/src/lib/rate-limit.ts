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

/** Atomic shared budget. Keys are hashed so login/IP values are not stored in plain text. */
export async function consumeLimit(scope: string, key: string, max: number, windowMs: number): Promise<number> {
  const { createHash } = await import('node:crypto')
  const { query } = await import('../db/pool.ts')
  const id = scope + ':' + createHash('sha256').update(key).digest('hex')
  const row = (
    await query(
      `
    INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,now()+$2*interval '1 millisecond')
    ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN rate_limits.expires_at<=now() THEN 1 ELSE rate_limits.count+1 END,
      expires_at=CASE WHEN rate_limits.expires_at<=now() THEN excluded.expires_at ELSE rate_limits.expires_at END
    RETURNING count, GREATEST(1,ceil(extract(epoch FROM (expires_at-now()))/60))::int AS wait
  `,
      [id, windowMs],
    )
  ).rows[0]
  return row.count > max ? row.wait : 0
}

export function createSharedLimiter({ scope, max, windowMs }: { scope: string; max: number; windowMs: number }) {
  const id = async (key: string) => {
    const { createHash } = await import('node:crypto')
    return scope + ':' + createHash('sha256').update(key).digest('hex')
  }
  return {
    async blockedFor(key: string) {
      const { query } = await import('../db/pool.ts')
      const row = (
        await query(
          'SELECT GREATEST(1,ceil(extract(epoch FROM (expires_at-now()))/60))::int AS wait FROM rate_limits WHERE key=$1 AND expires_at>now() AND count>=$2',
          [await id(key), max],
        )
      ).rows[0]
      return Number(row?.wait || 0)
    },
    hit: (key: string) => consumeLimit(scope, key, max, windowMs),
    async reset(key: string) {
      const { query } = await import('../db/pool.ts')
      await query('DELETE FROM rate_limits WHERE key=$1', [await id(key)])
    },
  }
}

export async function releaseLimit(scope: string, key: string) {
  const { createHash } = await import('node:crypto')
  const { query } = await import('../db/pool.ts')
  const id = scope + ':' + createHash('sha256').update(key).digest('hex')
  await query('UPDATE rate_limits SET count=GREATEST(0,count-1) WHERE key=$1', [id])
}

export async function limitUsage(scope: string, key: string) {
  const { createHash } = await import('node:crypto')
  const { query } = await import('../db/pool.ts')
  const id = scope + ':' + createHash('sha256').update(key).digest('hex')
  return Number((await query('SELECT count FROM rate_limits WHERE key=$1 AND expires_at>now()', [id])).rows[0]?.count || 0)
}
