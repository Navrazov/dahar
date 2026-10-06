import { writeFile } from 'node:fs/promises'
import { cpus, totalmem, platform } from 'node:os'
const url = process.env.DATABASE_URL || ''
if (!/_test$/.test(new URL(url || 'postgres://x/none').pathname)) throw new Error('Load check requires a *_test database')
const { pool, query } = await import('../server/src/db/pool.ts')
const { migrate } = await import('../server/src/db/migrations.ts')
const { createUser, deleteUser } = await import('../server/src/modules/users/users.repository.ts')
const { createApp } = await import('../server/src/app.ts')
await migrate({ log: () => {} })
const user = await createUser({ login: 'load-' + Date.now().toString(36), password: 'isolated-load-password' })
const server = createApp().listen(0, '127.0.0.1')
await new Promise<void>((resolve) => server.once('listening', resolve))
const address = server.address() as { port: number }
const base = `http://127.0.0.1:${address.port}`
try {
  await query(
    `INSERT INTO tasks(user_id,title,status,due_date,completed_at) SELECT $1,'Load task '||n,CASE WHEN n%3=0 THEN 'done' ELSE 'todo' END,current_date+(n%30-15),CASE WHEN n%3=0 THEN now()::timestamp END FROM generate_series(1,10000)n`,
    [user.id],
  )
  await query(
    `INSERT INTO transactions(user_id,date,kind,amount,category) SELECT $1,current_date-(n%365),'expense',100+(n%100),'Category '||(n%10) FROM generate_series(1,20000)n`,
    [user.id],
  )
  const habits = (
    await query(
      `INSERT INTO habits(user_id,name,kind,frequency,start_date) SELECT $1,'Load habit '||n,'build','daily','2025-01-01'::date FROM generate_series(1,125)n RETURNING id`,
      [user.id],
    )
  ).rows.map((row) => row.id)
  await query(
    `INSERT INTO habit_logs(user_id,habit_id,date,status) SELECT $1,($2::integer[])[1+n/400],'2025-01-01'::date+n%400,'done' FROM generate_series(0,49999)n`,
    [user.id, habits],
  )
  const cookies = await Promise.all(
    Array.from({ length: 50 }, async () => {
      const response = await fetch(base + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: user.login, password: 'isolated-load-password' }),
      })
      if (!response.ok) throw new Error(`Session setup failed: ${response.status}`)
      return response.headers.get('set-cookie')!.split(';')[0]
    }),
  )
  const paths = ['/api/tasks?limit=100', '/api/habit_logs?limit=500', '/api/finance/summary?month=2026-10']
  const timings: Record<string, number[]> = Object.fromEntries(paths.map((path) => [path, []]))
  let failures = 0
  const started = performance.now()
  await Promise.all(
    cookies.map(async (cookie) => {
      for (let round = 0; round < 6; round++) {
        const path = paths[round % paths.length]
        const start = performance.now()
        const response = await fetch(base + path, { headers: { cookie }, signal: AbortSignal.timeout(15000) })
        await response.arrayBuffer()
        timings[path].push(performance.now() - start)
        if (!response.ok) failures++
      }
    }),
  )
  const results = Object.fromEntries(
    Object.entries(timings).map(([path, times]) => {
      times.sort((a, b) => a - b)
      return [
        path,
        {
          requests: times.length,
          p50_ms: Math.round(times[Math.floor(times.length * 0.5)]),
          p95_ms: Math.round(times[Math.floor(times.length * 0.95)]),
          max_ms: Math.round(times.at(-1)!),
        },
      ]
    }),
  )
  const report = {
    at: new Date().toISOString(),
    host: { platform: platform(), cpu: cpus()[0]?.model, cores: cpus().length, memory_gb: Math.round(totalmem() / 1024 ** 3), node: process.version },
    data: { tasks: 10000, habit_logs: 50000, transactions: 20000 },
    concurrent_sessions: 50,
    requests: 300,
    failures,
    elapsed_ms: Math.round(performance.now() - started),
    results,
    limits: 'Local warm-cache API benchmark, not a browser benchmark or production SLA',
  }
  const output = process.env.LOAD_REPORT || '/private/tmp/dahar-load-report.json'
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
  if (failures) process.exitCode = 1
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await deleteUser(user.id)
  await pool.end()
}
