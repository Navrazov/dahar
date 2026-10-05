import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { api } from '@/shared/api'
import { Button, Field, Input, Modal } from '@/shared/ui'

function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.getRandomValues(new Uint32Array(12)), (n) => alphabet[n % alphabet.length]).join('')
}

export function CreateUser() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ login: '', name: '', password: '' })
  const [busy, setBusy] = useState(false)

  const start = () => {
    setForm({ login: '', name: '', password: generatePassword() })
    setOpen(true)
  }

  const submit = async () => {
    setBusy(true)
    try {
      const user = await api.createUser(form)
      await qc.invalidateQueries()
      await navigator.clipboard?.writeText(`Логин: ${user.login}\nПароль: ${form.password}`).catch(() => {})
      toast.success(`Пользователь ${user.login} создан. Логин и пароль скопированы`)
      setOpen(false)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <>
      <Button variant="primary" icon={Plus} onClick={start}>
        Пользователь
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Новый пользователь"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Отмена</Button>
            <Button variant="primary" onClick={submit} disabled={busy || !form.login || form.password.length < 8}>
              Создать
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Field label="Логин" hint="Латиница, цифры, точка, дефис">
            <Input value={form.login} onChange={set('login')} autoCapitalize="none" autoFocus />
          </Field>
          <Field label="Имя">
            <Input value={form.name} onChange={set('name')} />
          </Field>
          <Field label="Пароль" hint="Сгенерирован автоматически, после создания скопируется вместе с логином">
            <div className="flex gap-2">
              <Input value={form.password} onChange={set('password')} className="font-mono" />
              <Button onClick={() => setForm((f) => ({ ...f, password: generatePassword() }))}>Другой</Button>
            </div>
          </Field>
        </div>
      </Modal>
    </>
  )
}
