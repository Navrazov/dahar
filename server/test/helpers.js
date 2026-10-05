const url = process.env.DATABASE_URL || ''
if (!/_test$/.test(new URL(url || 'postgres://x/none').pathname)) {
  throw new Error(`Tests wipe the database — DATABASE_URL must point to a *_test database (got "${url}")`)
}

const db = await import('../src/db/pool.js')
const { migrate } = await import('../src/db/migrations.js')
const { createApp } = await import('../src/app.js')
const { hashPassword } = await import('../src/lib/crypto.js')

export const { query, pool } = db

export async function resetDatabase() {
  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await migrate({ log: () => {} })
}

export async function startApp() {
  const server = createApp().listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}`
  return { base, close: () => new Promise((r) => server.close(r)) }
}

export async function createUser(login, password = 'password123') {
  const { rows } = await query('INSERT INTO users (login, password_hash, name) VALUES ($1, $2, $1) RETURNING id', [login, await hashPassword(password)])
  return rows[0].id
}

async function signIn(base, path, body) {
  const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (res.status !== 200) throw new Error(`${path} as ${body.login} failed: ${res.status}`)
  return client(base, res.headers.get('set-cookie').split(';')[0])
}

export function client(base, cookie) {
  const call = async (method, path, body) => {
    const r = await fetch(`${base}${path}`, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const text = await r.text()
    let parsed = text
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

export const login = (base, loginName, password = 'password123') => signIn(base, '/api/auth/login', { login: loginName, password })

export const adminLogin = (base, loginName, password) => signIn(base, '/api/admin/auth/login', { login: loginName, password })

export const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
