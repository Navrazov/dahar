import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** TOTP по RFC 6238 (то, что показывают Google Authenticator, 1Password и т.п.): SHA-1, 6 цифр, шаг 30 секунд. */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP = 30
const DIGITS = 6

export function base32Encode(buf: Buffer) {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(s: string) {
  const clean = s.replace(/[\s=-]/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch)
    if (idx < 0) throw new Error('Invalid base32')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export const newSecret = () => base32Encode(randomBytes(20))

export const currentStep = (at = Date.now()) => Math.floor(at / 1000 / STEP)

export function codeAt(secret: string, step: number) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 15
  const n = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS
  return String(n).padStart(DIGITS, '0')
}

/**
 * Проверяет код с допуском ±1 шаг на рассинхрон часов. Возвращает шаг, на котором код совпал, или null.
 * Шаг нужно сохранить и не принимать коды с шагом не больше него — так один код нельзя использовать дважды.
 */
export function verifyTotp(secret: string, code: unknown, lastStep: number | null = null, at = Date.now()): number | null {
  const digits = String(code ?? '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(digits)) return null
  const now = currentStep(at)
  for (const step of [now - 1, now, now + 1]) {
    if (lastStep !== null && step <= lastStep) continue
    if (timingSafeEqual(Buffer.from(codeAt(secret, step)), Buffer.from(digits))) return step
  }
  return null
}

export const otpauthUrl = (secret: string, account: string, issuer = 'Dahar') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`

/** Коды восстановления: показываются один раз, в базе — только хеши. */
export const newRecoveryCodes = (n = 10) =>
  Array.from({ length: n }, () => {
    const raw = base32Encode(randomBytes(5)).slice(0, 8).toLowerCase()
    return `${raw.slice(0, 4)}-${raw.slice(4)}`
  })

export const normalizeRecoveryCode = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z2-7]/g, '')
