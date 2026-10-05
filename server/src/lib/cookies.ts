import { config } from '../config.ts'

export function parseCookies(header = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i <= 0) continue
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
    } catch {}
  }
  return out
}

export function serializeCookie(name: string, value: string, { maxAge, path = '/' }: { maxAge: number; path?: string }) {
  return [`${name}=${value}`, `Path=${path}`, 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`, config.isProd ? 'Secure' : null].filter(Boolean).join('; ')
}
