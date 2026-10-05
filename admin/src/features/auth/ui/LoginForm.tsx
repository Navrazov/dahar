import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'
import { Button, Field, Input, Logo } from '@/shared/ui'
import { ME_KEY } from '@/entities/session'

export function LoginForm() {
  const qc = useQueryClient()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { admin } = await api.login(login, password)
      qc.setQueryData(ME_KEY, admin)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-[340px]">
      <Logo />
      <h1 className="mt-10 text-[24px] font-semibold tracking-[-0.025em]">Вход для владельца</h1>
      <p className="mt-1.5 mb-7 text-[14px] text-fg-2">Отдельная учётная запись, не связанная с пользователями сервиса.</p>
      <div className="space-y-4">
        <Field label="Логин">
          <Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="none" autoFocus className="h-10" />
        </Field>
        <Field label="Пароль">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="h-10" />
        </Field>
        {error && <p className="text-[13px] text-bad">{error}</p>}
        <Button type="submit" variant="primary" disabled={busy || !login || !password} className="h-10 w-full">
          {busy ? 'Входим…' : 'Войти'}
        </Button>
      </div>
    </form>
  )
}
