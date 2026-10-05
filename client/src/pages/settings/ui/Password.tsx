import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/shared/api'
import { Button, Card, CardHeader, FieldLabel, Input } from '@/shared/ui'

export function Password() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (next.length < 8) return toast.error('Новый пароль — минимум 8 символов')
    if (next !== repeat) return toast.error('Пароли не совпадают')
    setBusy(true)
    try {
      await api.changePassword(current, next)
      toast.success('Пароль изменён')
      setCurrent('')
      setNext('')
      setRepeat('')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardHeader title="Пароль" />
      <form onSubmit={submit} className="space-y-4 px-4 pb-4">
        <FieldLabel label="Текущий пароль">
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </FieldLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldLabel label="Новый пароль" hint="Минимум 8 символов">
            <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </FieldLabel>
          <FieldLabel label="Повторите">
            <Input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </FieldLabel>
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={busy} disabled={!current || !next}>
            Сменить пароль
          </Button>
        </div>
      </form>
    </Card>
  )
}
