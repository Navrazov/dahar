import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/shared/api'
import { Button, Card, CardHeader, Field, Input } from '@/shared/ui'

export function ChangePassword() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      await api.changePassword(current, next)
      toast.success('Пароль администратора изменён')
      setCurrent('')
      setNext('')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader title="Пароль администратора" />
      <div className="space-y-3 px-4 pb-4">
        <Field label="Текущий пароль">
          <Input readOnly={busy} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="Новый пароль" hint="Не короче 8 символов">
          <Input readOnly={busy} type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <Button variant="primary" onClick={submit} loading={busy} disabled={!current || next.length < 8}>
          Сменить пароль
        </Button>
      </div>
    </Card>
  )
}
