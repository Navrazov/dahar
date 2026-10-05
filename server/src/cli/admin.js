import { pool } from '../db/pool.js'
import { migrate } from '../db/migrations.js'
import { MIN_PASSWORD } from '../modules/auth/auth.routes.js'
import { createAdmin, deleteAdmin, findAdminByLogin, listAdmins, setAdminPassword } from '../modules/admin/admin.repository.js'
import { adminSessions } from '../modules/admin/admin.sessions.js'

const [cmd, login, password] = process.argv.slice(2)

const requirePassword = (p) => {
  if (!p || p.length < MIN_PASSWORD) throw new Error(`Пароль должен быть не короче ${MIN_PASSWORD} символов`)
}

const commands = {
  async create() {
    if (!login) throw new Error('Использование: create <login> <password>')
    requirePassword(password)
    if (await findAdminByLogin(login)) throw new Error('Такой администратор уже есть')
    const admin = await createAdmin(login, password)
    console.log(`Создан администратор «${admin.login}»`)
  },
  async password() {
    requirePassword(password)
    const admin = await findAdminByLogin(login)
    if (!admin) throw new Error('Администратор не найден')
    await setAdminPassword(admin.id, password)
    await adminSessions.endAllFor(admin.id)
    console.log('Пароль администратора изменён, сессии завершены')
  },
  async list() {
    console.table(await listAdmins())
  },
  async delete() {
    console.log((await deleteAdmin(login)) ? 'Администратор удалён' : 'Администратор не найден')
  },
}

async function main() {
  await migrate({ log: () => {} })
  const run = commands[cmd]
  if (!run) return console.log('Команды: create <login> <password> | password <login> <new> | list | delete <login>')
  await run()
}

main()
  .catch((e) => {
    console.error('Ошибка:', e.message)
    process.exitCode = 1
  })
  .finally(() => pool.end())
