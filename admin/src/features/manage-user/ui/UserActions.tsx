import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, type UserDetail } from '@/shared/api'
import { Button, Field, Input, Modal } from '@/shared/ui'

type Dialog = 'rename' | 'password' | 'delete' | null

export function UserActions({ user }: { user: UserDetail }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true)
    try {
      await fn()
      await qc.invalidateQueries()
      toast.success(done)
      setDialog(null)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const open = (d: Dialog, initial = '') => {
    setValue(initial)
    setDialog(d)
  }

  return (
    <>
      <Button onClick={() => open('rename', user.name ?? '')}>Переименовать</Button>
      <Button onClick={() => open('password')}>Сбросить пароль</Button>
      <Button onClick={() => run(() => api.endSessions(user.id), 'Все сессии завершены')} disabled={busy}>
        Выйти везде
      </Button>
      <Button
        variant={user.blocked_at ? 'secondary' : 'danger'}
        onClick={() => run(() => api.updateUser(user.id, { blocked: !user.blocked_at }), user.blocked_at ? 'Разблокирован' : 'Заблокирован')}
        disabled={busy}
      >
        {user.blocked_at ? 'Разблокировать' : 'Заблокировать'}
      </Button>
      <Button variant="danger" onClick={() => open('delete')}>
        Удалить
      </Button>

      <Modal
        open={dialog === 'rename'}
        onClose={() => setDialog(null)}
        title="Имя пользователя"
        footer={
          <Button variant="primary" disabled={busy} onClick={() => run(() => api.updateUser(user.id, { name: value }), 'Имя изменено')}>
            Сохранить
          </Button>
        }
      >
        <Field label="Имя">
          <Input value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </Field>
      </Modal>

      <Modal
        open={dialog === 'password'}
        onClose={() => setDialog(null)}
        title={`Новый пароль для ${user.login}`}
        footer={
          <Button
            variant="primary"
            disabled={busy || value.length < 8}
            onClick={() => run(() => api.updateUser(user.id, { password: value }), 'Пароль изменён, сессии завершены')}
          >
            Сменить
          </Button>
        }
      >
        <Field label="Пароль" hint="Не короче 8 символов. Все сессии пользователя будут завершены">
          <Input value={value} onChange={(e) => setValue(e.target.value)} autoFocus className="font-mono" />
        </Field>
      </Modal>

      <Modal
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        title="Удалить пользователя"
        footer={
          <Button
            variant="danger"
            disabled={busy || value.trim().toLowerCase() !== user.login}
            onClick={() =>
              run(async () => {
                await api.deleteUser(user.id, value)
                navigate('/users')
              }, 'Пользователь удалён')
            }
          >
            Удалить навсегда
          </Button>
        }
      >
        <p className="mb-3 text-[14px] text-fg-2">
          Будут удалены аккаунт и все записи пользователя. Отменить нельзя. Для подтверждения введите логин <b className="text-fg">{user.login}</b>.
        </p>
        <Input value={value} onChange={(e) => setValue(e.target.value)} autoFocus autoCapitalize="none" />
      </Modal>
    </>
  )
}
