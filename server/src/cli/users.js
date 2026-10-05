import { pool, query } from '../db/pool.js'
import { migrate } from '../db/migrations.js'
import { MIN_PASSWORD } from '../modules/auth/auth.routes.js'
import { createUser, deleteUser, findByLogin, normalizeLogin, setPassword } from '../modules/users/users.repository.js'

const [cmd, login, arg, ...rest] = process.argv.slice(2)

const requirePassword = (p) => {
  if (!p || p.length < MIN_PASSWORD) throw new Error(`Пароль должен быть не короче ${MIN_PASSWORD} символов`)
}

const commands = {
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
  async delete() {
    const user = await findByLogin(normalizeLogin(login))
    console.log(user && (await deleteUser(user.id)) ? 'Пользователь и все его данные удалены' : 'Пользователь не найден')
  },
}

async function main() {
  await migrate({ log: () => {} })
  const run = commands[cmd]
  if (!run) return console.log('Команды: create <login> <password> [name] | password <login> <new> | list | delete <login>')
  await run()
}

main()
  .catch((e) => {
    console.error('Ошибка:', e.message)
    process.exitCode = 1
  })
  .finally(() => pool.end())
