import type { AddressInfo } from 'node:net'

const url = process.env.DATABASE_URL || ''
if (!/_test$/.test(new URL(url || 'postgres://x/none').pathname)) {
  throw new Error(`Tests wipe the database — DATABASE_URL must point to a *_test database (got "${url}")`)
}

const db = await import('../src/db/pool.ts')
const { migrate } = await import('../src/db/migrations.ts')
const { createApp } = await import('../src/app.ts')
const { hashPassword } = await import('../src/lib/crypto.ts')
const { codeAt, currentStep } = await import('../src/lib/totp.ts')

export const { query, pool } = db

export interface App {
  base: string
  close: () => Promise<void>
}

export interface Reply {
  status: number

  body: any
}

export interface Client {
  cookie: string | null
  get: (path: string) => Promise<Reply>
  post: (path: string, body?: unknown) => Promise<Reply>
  patch: (path: string, body: unknown) => Promise<Reply>
  put: (path: string, body: unknown) => Promise<Reply>
  del: (path: string, body?: unknown) => Promise<Reply>
}

export async function resetDatabase() {
  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await migrate({ log: () => {} })
}

export async function startApp(opts?: Parameters<typeof createApp>[0]): Promise<App> {
  const server = createApp(opts).listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return { base, close: () => new Promise<void>((r) => server.close(() => r())) }
}

export async function createUser(login: string, password = 'password123'): Promise<number> {
  const { rows } = await query('INSERT INTO users (login, password_hash, name) VALUES ($1, $2, $1) RETURNING id', [login, await hashPassword(password)])
  return rows[0].id
}

const postJson = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/** Текущий код из приложения-аутентификатора для этого секрета. */
export const totpNow = (secret: string) => codeAt(secret, currentStep())

async function signIn(base: string, path: string, body: Record<string, string>, secretOf?: () => Promise<string>) {
  let res = await postJson(`${base}${path}`, body)
  if (res.status !== 200) throw new Error(`${path} as ${body.login} failed: ${res.status}`)
  const first = (await res.clone().json()) as Reply['body']
  if (first.setupRequired || first.twoFactor) {
    const secret = first.setupRequired ? first.secret : await secretOf!()
    res = await postJson(`${base}${path}/2fa`, { ticket: first.ticket, code: totpNow(secret) })
    if (res.status !== 200) throw new Error(`${path}/2fa as ${body.login} failed: ${res.status}`)
  }
  return client(base, (res.headers.get('set-cookie') ?? '').split(';')[0])
}

export function client(base: string, cookie: string | null = null): Client {
  const call = async (method: string, path: string, body?: unknown): Promise<Reply> => {
    const r = await fetch(`${base}${path}`, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const text = await r.text()
    let parsed: unknown = text
    try {
      parsed = JSON.parse(text)
    } catch {}
    return { status: r.status, body: parsed }
  }
  return {
    cookie,
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b ?? {}),
    patch: (p, b) => call('PATCH', p, b),
    put: (p, b) => call('PUT', p, b),
    del: (p, b) => call('DELETE', p, b),
  }
}

export const login = (base: string, loginName: string, password = 'password123') => signIn(base, '/api/auth/login', { login: loginName, password })

/** Вход в админку со вторым фактором. В тестах входим часто, поэтому сбрасываем «использованный шаг» кода. */
export const adminLogin = (base: string, loginName: string, password: string) =>
  signIn(base, '/api/admin/auth/login', { login: loginName, password }, async () => {
    const { rows } = await query('UPDATE admins SET totp_last_step = NULL WHERE lower(login) = lower($1) RETURNING totp_secret', [loginName])
    return rows[0].totp_secret
  })

export const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
