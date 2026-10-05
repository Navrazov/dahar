const nf = (digits: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 })

export function num(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return nf(digits).format(v)
}

export function money(v: number | null | undefined, cur = '₽', digits = 0): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const s = nf(digits).format(Math.abs(v))
  const sign = v < 0 ? '−' : ''
  return cur === '$' || cur === '€' ? `${sign}${cur}${s}` : `${sign}${s} ${cur}`
}

export function signedMoney(v: number | null | undefined, cur = '₽', digits = 0): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return (v > 0 ? '+' : '') + money(v, cur, digits)
}

export function compact(v: number): string {
  return new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
}

export const pct = (v: number | null | undefined, digits = 0) => (v == null || !Number.isFinite(v) ? '—' : `${num(v * 100, digits)}%`)

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

export const sum = (xs: (number | null | undefined)[]) => xs.reduce<number>((a, b) => a + (b || 0), 0)
