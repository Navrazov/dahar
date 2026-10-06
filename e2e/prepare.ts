// Готовит чистую базу для e2e: схема, миграции и тестовый пользователь. Запускается перед сервером.
const url = process.env.DATABASE_URL || ''
if (!/_test$/.test(new URL(url || 'postgres://x/none').pathname)) {
  throw new Error(`e2e wipes the database — DATABASE_URL must point to a *_test database (got "${url}")`)
}

const { pool, query } = await import('../server/src/db/pool.ts')
const { migrate } = await import('../server/src/db/migrations.ts')
const { createUser } = await import('../server/src/modules/users/users.repository.ts')
const { createAdmin } = await import('../server/src/modules/admin/admin.repository.ts')

await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
await migrate({ log: () => {} })
await createUser({ login: 'e2e', password: 'e2e-password', name: 'Тест' })
await createUser({ login: 'e2e-onboarding', password: 'e2e-password', name: 'Новый' })
await createUser({ login: 'e2e-2fa', password: 'e2e-password', name: 'Защищённый' })
await createUser({ login: 'e2e-launch-a', password: 'e2e-password', name: 'Launch A' })
await createUser({ login: 'e2e-launch-b', password: 'e2e-password', name: 'Launch B' })
await query(
  "INSERT INTO settings(user_id,key,value) SELECT id,'modules','{\"finance\":{\"enabled\":true}}'::jsonb FROM users WHERE login='e2e' ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value",
)
await createUser({ login: 'e2e-mini-pages', password: 'e2e-password', name: 'Mini Pages' })
await query("INSERT INTO tasks(user_id,title) SELECT u.id,'Paged Mini '||i FROM users u CROSS JOIN generate_series(1,65) i WHERE u.login='e2e-mini-pages'")
await createAdmin('owner', 'owner-password')
await createAdmin('admin-e2e', 'admin-password')
await pool.end()
console.log('e2e database ready')
