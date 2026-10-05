import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, type AdminLoginStep } from '@/shared/api'
import { Button, Field, Input, Logo, QrCode } from '@/shared/ui'
import { ME_KEY } from '@/entities/session'

export function LoginForm() {
  const qc = useQueryClient()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<AdminLoginStep | null>(null)
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

  const submit = (e: FormEvent) => {
    e.preventDefault()
    run(async () => {
      setStep(await api.login(login, password))
      setCode('')
    })
  }

  const submitCode = (e: FormEvent) => {
    e.preventDefault()
    if (!step) return
    run(async () => {
      try {
        const { admin } = await api.loginCode(step.ticket, code.trim())
        qc.setQueryData(ME_KEY, admin)
      } catch (err) {
        if (/истекло|заново/i.test((err as Error).message)) setStep(null)
        throw err
      }
    })
  }

  if (step) {
    const setup = 'setupRequired' in step ? step : null
    return (
      <form onSubmit={submitCode} className="w-full max-w-[360px]">
        <Logo />
        <h1 className="mt-10 text-[24px] font-semibold tracking-[-0.025em]">{setup ? 'Привяжите приложение' : 'Код подтверждения'}</h1>
        <p className="mt-1.5 mb-6 text-[14px] text-fg-2">
          {setup
            ? 'Вход в админку защищён вторым фактором. Отсканируйте код в приложении-аутентификаторе и введите 6 цифр.'
            : 'Введите 6 цифр из приложения-аутентификатора.'}
        </p>
        {setup && (
          <div className="mb-6 flex flex-col items-center gap-3">
            <QrCode value={setup.otpauth} label="QR-код для приложения-аутентификатора" />
            <code className="text-center text-[12.5px] tracking-wider break-all text-fg-2 select-all">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
          </div>
        )}
        <div className="space-y-4">
          <Field label="Код">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              className="h-10 text-center text-[18px] tracking-[0.3em]"
            />
          </Field>
          {error && <p className="text-[13px] text-bad">{error}</p>}
          <Button type="submit" variant="primary" disabled={busy || code.replace(/\D/g, '').length !== 6} className="h-10 w-full">
            {busy ? 'Проверяем…' : 'Войти'}
          </Button>
          <Button type="button" className="w-full" onClick={() => setStep(null)}>
            Назад
          </Button>
        </div>
      </form>
    )
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
