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
  const [created, setCreated] = useState<string | null>(null)

  const start = () => {
    setCreated(null)
    setForm({ login: '', name: '', password: generatePassword() })
    setOpen(true)
  }

  const submit = async () => {
    setBusy(true)
    try {
      const user = await api.createUser(form)
      await qc.invalidateQueries()
      let copied = false
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(`Логин: ${user.login}\nПароль: ${form.password}`)
          copied = true
        }
      } catch {
        /* Clipboard can be unavailable in an embedded browser. */
      }
      toast.success(`Пользователь ${user.login} создан${copied ? '. Логин и пароль скопированы' : '. Сохраните введённый пароль'}`)
      setCreated(user.login)
      if (copied) setOpen(false)
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
        onClose={() => !busy && setOpen(false)}
        title={created ? 'Пользователь создан' : 'Новый пользователь'}
        footer={
          created ? (
            <Button onClick={() => setOpen(false)}>Готово</Button>
          ) : (
            <>
              <Button disabled={busy} onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button variant="primary" onClick={submit} loading={busy} disabled={!form.login || form.password.length < 8}>
                Создать
              </Button>
            </>
          )
        }
      >
        <div className="space-y-3.5">
          <Field label="Логин" hint="Латиница, цифры, точка, дефис">
            <Input value={created || form.login} readOnly={busy || !!created} onChange={set('login')} autoCapitalize="none" maxLength={32} />
          </Field>
          <Field label="Имя">
            <Input value={form.name} readOnly={busy || !!created} onChange={set('name')} maxLength={100} />
          </Field>
          {created && <p className="text-[13px] text-good">Аккаунт создан. Буфер обмена недоступен: сохраните логин и пароль вручную перед закрытием.</p>}
          <Field label="Пароль" hint="Сгенерирован автоматически; после создания попробуем скопировать доступ">
            <div className="flex gap-2">
              <Input value={form.password} readOnly={busy || !!created} onChange={set('password')} className="font-mono" />
              <Button disabled={busy || !!created} onClick={() => setForm((f) => ({ ...f, password: generatePassword() }))}>
                Другой
              </Button>
            </div>
          </Field>
        </div>
      </Modal>
    </>
  )
}
