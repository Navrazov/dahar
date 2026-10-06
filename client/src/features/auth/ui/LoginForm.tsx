import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { api, request, type User } from '@/shared/api'
import { Button, FieldLabel, Input, Logo } from '@/shared/ui'
import { signInLocally } from '@/entities/session'

export function LoginForm() {
  const qc = useQueryClient()
  const registration = useQuery({
    queryKey: ['registration-config'],
    queryFn: () => request<{ registration: boolean; terms_url: string | null; privacy_url: string | null }>('/api/auth/config'),
    meta: { persist: false },
  })
  const [register, setRegister] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [ticket, setTicket] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const done = (user: User) => signInLocally(qc, user)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!login || !password) return setError('Введите логин и пароль')
    run(async () => {
      const res = register
        ? await request<{ user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ login, password, accepted_terms: accepted }) })
        : await api.login(login, password)
      if ('twoFactor' in res) {
        setTicket(res.ticket)
        setCode('')
      } else done(res.user)
    })
  }

  const submitCode = (e: FormEvent) => {
    e.preventDefault()
    if (!ticket || !code.trim()) return setError('Введите код')
    run(async () => {
      try {
        done((await api.loginCode(ticket, code.trim())).user)
      } catch (err) {
        if (/истекло|заново/i.test((err as Error).message)) setTicket(null)
        throw err
      }
    })
  }

  if (ticket) {
    return (
      <form onSubmit={submitCode} className="w-full max-w-[340px]">
        <Logo className="mb-10" />
        <h1 className="text-[24px] font-semibold tracking-[-0.025em]">Код подтверждения</h1>
        <p className="mt-1.5 mb-7 text-[14px] text-fg-2">
          Откройте приложение-аутентификатор и введите 6 цифр. Если телефона нет под рукой — подойдёт код восстановления.
        </p>
        <div className="space-y-4">
          <FieldLabel label="Код">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="123 456"
              className="h-10 text-center text-[18px] tracking-[0.3em] tabular"
            />
          </FieldLabel>
          {register && (
            <label className="flex gap-2 text-xs text-fg-2">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />{' '}
              <span>
                Принимаю{' '}
                <a className="underline" href={registration.data?.terms_url || undefined} target="_blank" rel="noreferrer">
                  условия
                </a>{' '}
                и{' '}
                <a className="underline" href={registration.data?.privacy_url || undefined} target="_blank" rel="noreferrer">
                  политику конфиденциальности
                </a>
                .
              </span>
            </label>
          )}
          {error && <p className="animate-[fade-in_200ms_ease-out] text-[13px] text-bad">{error}</p>}
          <Button type="submit" variant="primary" loading={busy} className="h-10 w-full">
            {busy ? 'Проверяем…' : 'Подтвердить'}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => setTicket(null)}>
            Назад
          </Button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={submit} className="w-full max-w-[340px]">
      <Logo className="mb-10" />
      <h1 className="text-[24px] font-semibold tracking-[-0.025em]">{register ? 'Создать аккаунт' : 'Вход'}</h1>
      <p className="mt-1.5 mb-7 text-[14px] text-fg-2">
        {registration.data?.registration ? '14 дней для знакомства с Dahar, без банковской карты.' : 'Закрытый пилот: аккаунт выдаёт владелец сервиса.'}
      </p>
      <div className="space-y-4">
        <FieldLabel label="Логин">
          <Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="none" autoFocus className="h-10" />
        </FieldLabel>
        <FieldLabel label="Пароль">
          <div className="relative">
            <Input
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={register ? 'new-password' : 'current-password'}
              className="h-10 pr-10"
            />
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
        {register && (
          <label className="flex gap-2 text-xs text-fg-2">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />{' '}
            <span>
              Принимаю{' '}
              <a className="underline" href={registration.data?.terms_url || undefined} target="_blank" rel="noreferrer">
                условия
              </a>{' '}
              и{' '}
              <a className="underline" href={registration.data?.privacy_url || undefined} target="_blank" rel="noreferrer">
                политику конфиденциальности
              </a>
              .
            </span>
          </label>
        )}
        {error && <p className="animate-[fade-in_200ms_ease-out] text-[13px] text-bad">{error}</p>}
        <Button type="submit" variant="primary" loading={busy} disabled={register && !accepted} className="h-10 w-full">
          {busy ? 'Подождите…' : register ? 'Начать пробный период' : 'Войти'}
        </Button>
        {registration.data?.registration && (
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setRegister(!register)
              setError('')
            }}
          >
            {register ? 'Уже есть аккаунт? Войти' : 'Создать аккаунт'}
          </Button>
        )}
        <a href="/welcome" className="block text-center text-xs text-fg-3 underline">
          Как работает Dahar
        </a>
      </div>
    </form>
  )
}
