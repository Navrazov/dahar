import { config } from '../config.js'

export function parseCookies(header = '') {
  const out = {}
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

export function serializeCookie(name, value, { maxAge, path = '/' }) {
  return [`${name}=${value}`, `Path=${path}`, 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`, config.isProd ? 'Secure' : null].filter(Boolean).join('; ')
}
