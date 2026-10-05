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
await createAdmin('owner', 'owner-password')
await createAdmin('admin-e2e', 'admin-password')
await pool.end()
console.log('e2e database ready')
