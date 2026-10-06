// Read-only release smoke checks. Optional credentials use environment variables.
const base = (process.env.SMOKE_URL || 'http://localhost:3001').replace(/\/$/, '')
let cookie = ''
async function check(path: string, status = 200, json = false) {
  const start = performance.now()
  const response = await fetch(base + path, { headers: cookie ? { cookie } : {}, signal: AbortSignal.timeout(10000) })
  if (response.status !== status) throw new Error(`${path}: expected ${status}, got ${response.status}`)
  if (json && !response.headers.get('content-type')?.includes('application/json')) throw new Error(`${path}: expected JSON`)
  console.log(`${path}: ${response.status}, ${Math.round(performance.now() - start)}ms`)
}
await check('/api/health', 200, true)
await check('/api/ready', 200, true)
await check('/welcome')
await check('/guide.html')
await check('/api/auth/me', 401, true)
if (process.env.SMOKE_LOGIN && process.env.SMOKE_PASSWORD) {
  const response = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: process.env.SMOKE_LOGIN, password: process.env.SMOKE_PASSWORD }),
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error('Smoke account login failed')
  cookie = response.headers.get('set-cookie')?.split(';')[0] || ''
  if (!cookie) throw new Error('Use a dedicated non-2FA smoke account with no private data')
  await check('/api/auth/me', 200, true)
  await check('/api/tasks?limit=1', 200, true)
  await check('/api/subscription', 200, true)
  await fetch(base + '/api/auth/logout', { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: '{}' })
}
console.log('Smoke checks passed')
