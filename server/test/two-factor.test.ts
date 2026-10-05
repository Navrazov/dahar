import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { adminLogin, client, createUser, login, pool, query, resetDatabase, startApp, totpNow, type App, type Client, type Reply } from './helpers.ts'
import { createAdmin } from '../src/modules/admin/admin.repository.ts'
import { base32Decode, base32Encode, codeAt, currentStep, verifyTotp } from '../src/lib/totp.ts'

let app: App, user: Client

before(async () => {
  await resetDatabase()
  app = await startApp()
  await createUser('secure', 'secure-password')
  user = await login(app.base, 'secure', 'secure-password')
})

after(async () => {
  await app.close()
  await pool.end()
})

const post = (path: string, body: unknown) =>
  fetch(`${app.base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({
    status: r.status,
    body: (await r.json()) as Reply['body'],
    cookie: (r.headers.get('set-cookie') ?? '').split(';')[0],
  }))

const freshStep = (login: string) => query('UPDATE users SET totp_last_step = NULL WHERE login = $1', [login])

test('TOTP matches the RFC 6238 reference values', () => {
  // Секрет из приложения B к RFC 6238 ("12345678901234567890"), SHA-1, 6 цифр.
  const secret = base32Encode(Buffer.from('12345678901234567890'))
  assert.equal(codeAt(secret, Math.floor(59 / 30)), '287082')
  assert.equal(codeAt(secret, Math.floor(1111111109 / 30)), '081804')
  assert.equal(codeAt(secret, Math.floor(1234567890 / 30)), '005924')
  assert.deepEqual(base32Decode(secret), Buffer.from('12345678901234567890'))
})

test('a code is accepted once and only within ±30 seconds', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'))
  const now = Date.now()
  const step = verifyTotp(secret, codeAt(secret, currentStep(now)), null, now)
  assert.equal(step, currentStep(now))
  assert.equal(verifyTotp(secret, codeAt(secret, currentStep(now)), step, now), null, 'replay rejected')
  assert.equal(verifyTotp(secret, codeAt(secret, currentStep(now) - 3), null, now), null, 'too old')
})

test('user turns on 2FA; login then needs a code or a recovery code', async () => {
  assert.deepEqual((await user.get('/api/auth/2fa')).body, { enabled: false, recoveryLeft: 0 })
  const setup = (await user.post('/api/auth/2fa/setup')).body
  assert.match(setup.otpauth, /^otpauth:\/\/totp\/Dahar%3Asecure\?secret=/)
  assert.equal((await user.post('/api/auth/2fa/enable', { code: '000000' })).status, 400)
  const enabled = await user.post('/api/auth/2fa/enable', { code: totpNow(setup.secret) })
  assert.equal(enabled.status, 200)
  assert.equal(enabled.body.recoveryCodes.length, 10)

  const first = await post('/api/auth/login', { login: 'secure', password: 'secure-password' })
  assert.deepEqual(Object.keys(first.body).sort(), ['ticket', 'twoFactor'])
  assert.equal(first.cookie, '', 'no session before the second factor')
  assert.equal((await post('/api/auth/login/2fa', { ticket: first.body.ticket, code: '123456' })).status, 401)

  await freshStep('secure')
  const ok = await post('/api/auth/login/2fa', { ticket: first.body.ticket, code: totpNow(setup.secret) })
  assert.equal(ok.status, 200)
  assert.equal((await client(app.base, ok.cookie).get('/api/auth/me')).body.user.login, 'secure')
  assert.equal((await post('/api/auth/login/2fa', { ticket: first.body.ticket, code: totpNow(setup.secret) })).status, 401, 'ticket is single-use')

  const recovery = enabled.body.recoveryCodes[0]
  const second = await post('/api/auth/login', { login: 'secure', password: 'secure-password' })
  assert.equal((await post('/api/auth/login/2fa', { ticket: second.body.ticket, code: recovery.toUpperCase() })).status, 200)
  const third = await post('/api/auth/login', { login: 'secure', password: 'secure-password' })
  assert.equal((await post('/api/auth/login/2fa', { ticket: third.body.ticket, code: recovery })).status, 401, 'recovery codes work once')
  assert.equal((await user.get('/api/auth/2fa')).body.recoveryLeft, 9)

  await freshStep('secure')
  assert.equal((await user.post('/api/auth/2fa/disable', { password: 'wrong', code: totpNow(setup.secret) })).status, 400)
  assert.equal((await user.post('/api/auth/2fa/disable', { password: 'secure-password', code: totpNow(setup.secret) })).status, 200)
  const plain = await post('/api/auth/login', { login: 'secure', password: 'secure-password' })
  assert.ok(plain.body.user, 'password alone works again')
})

test('a login ticket burns after too many wrong codes', async () => {
  await createUser('guess', 'guess-password')
  const g = await login(app.base, 'guess', 'guess-password')
  const setup = (await g.post('/api/auth/2fa/setup')).body
  await g.post('/api/auth/2fa/enable', { code: totpNow(setup.secret) })
  const first = await post('/api/auth/login', { login: 'guess', password: 'guess-password' })
  for (let i = 0; i < 5; i++) await post('/api/auth/login/2fa', { ticket: first.body.ticket, code: '000000' })
  await freshStep('guess')
  assert.equal((await post('/api/auth/login/2fa', { ticket: first.body.ticket, code: totpNow(setup.secret) })).status, 401)
})

test('admins must set up 2FA before their first session', async () => {
  await createAdmin('Root', 'root-password-1')
  const first = await post('/api/admin/auth/login', { login: 'root', password: 'root-password-1' })
  assert.equal(first.body.setupRequired, true)
  assert.equal(first.cookie, '')
  assert.equal((await post('/api/admin/auth/login/2fa', { ticket: first.body.ticket, code: '000000' })).status, 401)
  const done = await post('/api/admin/auth/login/2fa', { ticket: first.body.ticket, code: totpNow(first.body.secret) })
  assert.equal(done.status, 200)

  const next = await post('/api/admin/auth/login', { login: 'root', password: 'root-password-1' })
  assert.equal(next.body.twoFactor, true, 'from now on a code is required')
  assert.equal(next.body.secret, undefined, 'secret is never shown again')

  const admin = await adminLogin(app.base, 'root', 'root-password-1')
  const audit = (await admin.get('/api/admin/audit')).body.map((a: { action: string }) => a.action)
  assert.ok(audit.includes('admin_2fa_enabled'))
})
