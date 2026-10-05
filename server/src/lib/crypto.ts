import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, 64)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, saltB64, keyB64] = String(stored).split('$')
  if (algo !== 'scrypt' || !saltB64 || !keyB64) return false
  const expected = Buffer.from(keyB64, 'base64')
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length)
  return timingSafeEqual(actual, expected)
}

let dummyHash: Promise<string> | null = null

/**
 * Проверка пароля, когда учётной записи нет. Тратит столько же времени, сколько настоящая,
 * чтобы по задержке ответа нельзя было понять, существует ли логин.
 */
export async function verifyAgainstNothing(password: string) {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'))
  await verifyPassword(password, await dummyHash)
  return false
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')
