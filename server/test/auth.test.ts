import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createUser, pool, resetDatabase, startApp, type App } from './helpers.ts'

let app: App

before(async () => {
  await resetDatabase()
  app = await startApp()
  await createUser('victim')
})

after(async () => {
  await app.close()
  await pool.end()
})

const attempt = (login: string, password: string, ip?: string) =>
  fetch(`${app.base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(ip ? { 'X-Forwarded-For': ip } : {}) },
    body: JSON.stringify({ login, password }),
  })

async function timed(login: string) {
  const start = performance.now()
  await attempt(login, 'wrong-password', `10.1.0.${Math.floor(Math.random() * 250)}`)
  return performance.now() - start
}

test('a missing login takes as long as a wrong password', async () => {
  await timed('nobody')
  const existing: number[] = []
  const missing: number[] = []
  for (let i = 0; i < 4; i++) {
    existing.push(await timed('victim'))
    missing.push(await timed(`nobody${i}`))
  }
  const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  const ratio = median(missing) / median(existing)
  assert.ok(ratio > 0.5, `missing-user login answered ${ratio.toFixed(2)}× as fast — leaks which logins exist`)
})

test('one login is locked after many failures from different addresses', async () => {
  let last = 0
  for (let i = 0; i < 25; i++) last = (await attempt('victim', 'nope', `10.2.${i}.1`)).status
  assert.equal(last, 429, 'distributed guessing hits the per-login limit')
  assert.equal((await attempt('victim', 'password123', '10.3.0.1')).status, 429, 'even the right password waits until the window passes')
})
