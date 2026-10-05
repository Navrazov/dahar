import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from './helpers.ts'
import { runAsLeader } from '../src/jobs/leader.ts'

after(() => pool.end())

const until = async (cond: () => boolean, ms = 3000) => {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 20))
  }
}

test('only one instance runs background jobs; another takes over when it stops', async () => {
  const running: string[] = []
  const job = (name: string) => () => {
    running.push(name)
    return () => {
      running.splice(running.indexOf(name), 1)
    }
  }
  const quiet = { retryMs: 50, log: () => {} }
  const a = runAsLeader(job('a'), quiet)
  await until(() => a.isLeader())
  const b = runAsLeader(job('b'), quiet)
  await new Promise((r) => setTimeout(r, 200))
  assert.deepEqual(running, ['a'], 'second instance waits')
  assert.equal(b.isLeader(), false)

  await a.stop()
  await until(() => b.isLeader())
  assert.deepEqual(running, ['b'], 'jobs move to the surviving instance')
  await b.stop()
  assert.deepEqual(running, [])
})
