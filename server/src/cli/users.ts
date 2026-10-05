import { pool, query } from '../db/pool.ts'
import { migrate } from '../db/migrations.ts'
import { MIN_PASSWORD } from '../modules/auth/auth.routes.ts'
import { disable as disableTwoFactor } from '../modules/auth/two-factor.ts'
import { createUser, deleteUser, findByLogin, normalizeLogin, setPassword } from '../modules/users/users.repository.ts'

const [cmd, login, arg, ...rest] = process.argv.slice(2)

const requirePassword = (p: string | undefined) => {
  if (!p || p.length < MIN_PASSWORD) throw new Error(`Пароль должен быть не короче ${MIN_PASSWORD} символов`)
}

const commands: Record<string, () => Promise<void>> = {
  async create() {
    if (!login || !arg) throw new Error('Использование: create <login> <password> [name]')
    requirePassword(arg)
    const user = await createUser({ login, password: arg, name: rest.join(' ') || login })
    console.log(`Создан пользователь «${user.login}» (id ${user.id})`)
  },
  async password() {
    if (!login || !arg) throw new Error('Использование: password <login> <new-password>')
    requirePassword(arg)
    const user = await findByLogin(login)
    if (!user) throw new Error('Пользователь не найден')
    await setPassword(user.id, arg)
    console.log('Пароль изменён, активные сессии завершены')
  },
  async list() {
    const { rows } = await query('SELECT id, login, name, created_at, last_seen_at, blocked_at FROM users ORDER BY id')
    console.table(rows)
  },
  async 'reset-2fa'() {
    const user = await findByLogin(login)
    if (!user) throw new Error('Пользователь не найден')
    await disableTwoFactor('users', user.id)
    console.log('Двухфакторная защита отключена, коды восстановления удалены')
  },
  async delete() {
    const user = await findByLogin(normalizeLogin(login))
    console.log(user && (await deleteUser(user.id)) ? 'Пользователь и все его данные удалены' : 'Пользователь не найден')
  },
}

async function main() {
  await migrate({ log: () => {} })
  const run = commands[cmd]
  if (!run) return console.log('Команды: create <login> <password> [name] | password <login> <new> | list | delete <login> | reset-2fa <login>')
  await run()
}

main()
  .catch((e) => {
    console.error('Ошибка:', e.message)
    process.exitCode = 1
  })
  .finally(() => pool.end())
