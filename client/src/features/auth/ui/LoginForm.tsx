import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { api } from '@/shared/api'
import { Button, FieldLabel, Input, Logo } from '@/shared/ui'
import { signInLocally } from '@/entities/session'

export function LoginForm() {
  const qc = useQueryClient()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!login || !password) return setError('Введите логин и пароль')
    setBusy(true)
    setError('')
    try {
      const { user } = await api.login(login, password)
      signInLocally(qc, user)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-[340px]">
      <Logo className="mb-10" />
      <h1 className="text-[24px] font-semibold tracking-[-0.025em]">Вход</h1>
      <p className="mt-1.5 mb-7 text-[14px] text-fg-2">Аккаунт выдаёт владелец сервиса, открытой регистрации нет.</p>
      <div className="space-y-4">
        <FieldLabel label="Логин">
          <Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="none" autoFocus className="h-10" />
        </FieldLabel>
        <FieldLabel label="Пароль">
          <div className="relative">
            <Input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="h-10 pr-10" />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-fg-3 hover:text-fg"
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </FieldLabel>
        {error && <p className="text-[13px] text-bad">{error}</p>}
        <Button type="submit" variant="primary" disabled={busy} className="h-10 w-full">
          {busy ? 'Входим…' : 'Войти'}
        </Button>
      </div>
    </form>
  )
}
