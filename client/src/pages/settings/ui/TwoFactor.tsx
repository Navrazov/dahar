import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Copy, ShieldCheck } from 'lucide-react'
import { api } from '@/shared/api'
import { Badge, Button, Card, CardHeader, FieldLabel, Input, Modal, QrCode, Skeleton } from '@/shared/ui'

const KEY = ['two-factor'] as const

export function TwoFactor() {
  const qc = useQueryClient()
  const status = useQuery({ queryKey: KEY, queryFn: api.twoFactor })
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [confirm, setConfirm] = useState<'disable' | 'recovery' | null>(null)
  const [busy, setBusy] = useState(false)

  const start = async () => {
    setBusy(true)
    try {
      setSetup(await api.twoFactorSetup())
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const refresh = () => qc.invalidateQueries({ queryKey: KEY })

  return (
    <Card id="security">
      <CardHeader title="Двухфакторная защита" action={status.data?.enabled ? <Badge tone="good">Включена</Badge> : undefined} />
      <div className="space-y-3 px-4 pb-4 text-[13.5px] text-fg-2">
        {!status.data ? (
          <Skeleton className="h-16 rounded-[8px]" />
        ) : status.data.enabled ? (
          <>
            <p>
              При входе кроме пароля нужен код из приложения-аутентификатора. Кодов восстановления осталось:{' '}
              <span className="font-medium text-fg tabular">{status.data.recoveryLeft}</span>.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={() => setConfirm('recovery')}>Новые коды восстановления</Button>
              <Button variant="ghost" onClick={() => setConfirm('disable')}>
                Отключить
              </Button>
            </div>
          </>
        ) : (
          <>
            <p>Даже если пароль утечёт, без телефона в аккаунт не войти. Подойдёт любое приложение: Google Authenticator, 1Password, Яндекс Ключ.</p>
            <div className="flex justify-end">
              <Button variant="primary" icon={ShieldCheck} loading={busy} onClick={start}>
                Включить
              </Button>
            </div>
          </>
        )}
      </div>

      {setup && (
        <SetupDialog
          setup={setup}
          onClose={() => setSetup(null)}
          onEnabled={(recovery) => {
            setSetup(null)
            setCodes(recovery)
            refresh()
          }}
        />
      )}
      {codes && <RecoveryCodes codes={codes} onClose={() => setCodes(null)} />}
      {confirm && (
        <ConfirmDialog
          mode={confirm}
          onClose={() => setConfirm(null)}
          onDone={(recovery) => {
            setConfirm(null)
            if (recovery) setCodes(recovery)
            else toast.success('Двухфакторная защита отключена')
            refresh()
          }}
        />
      )}
    </Card>
  )
}

function SetupDialog({ setup, onClose, onEnabled }: { setup: { secret: string; otpauth: string }; onClose: () => void; onEnabled: (codes: string[]) => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      onEnabled((await api.twoFactorEnable(code.trim())).recoveryCodes)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Подключите приложение"
      description="Отсканируйте QR-код в приложении-аутентификаторе и введите код, который оно покажет"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="flex flex-col items-center gap-3">
          <QrCode value={setup.otpauth} label="QR-код для приложения-аутентификатора" />
          <p className="text-center text-[12.5px] text-fg-3">
            Не сканируется? Введите ключ вручную:
            <br />
            <code className="text-[13px] tracking-wider break-all text-fg select-all">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
          </p>
        </div>
        <FieldLabel label="Код из приложения">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            className="text-center tracking-[0.3em] tabular"
          />
        </FieldLabel>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={code.replace(/\D/g, '').length !== 6}>
            Подтвердить
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function RecoveryCodes({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const text = codes.join('\n')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Коды скопированы')
    } catch {
      toast.error('Не удалось скопировать — выделите коды вручную')
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Коды восстановления"
      description="Сохраните их в надёжном месте. Каждый код срабатывает один раз, если телефона нет под рукой. Больше мы их не покажем"
    >
      <div className="grid grid-cols-2 gap-2 rounded-[8px] border border-line bg-surface-2 p-3 font-mono text-[14px] tabular select-all">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button icon={Copy} onClick={copy}>
          Скопировать
        </Button>
        <Button variant="primary" onClick={onClose}>
          Я сохранил коды
        </Button>
      </div>
    </Modal>
  )
}

function ConfirmDialog({ mode, onClose, onDone }: { mode: 'disable' | 'recovery'; onClose: () => void; onDone: (codes?: string[]) => void }) {
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (mode === 'disable') {
        await api.twoFactorDisable(password, code.trim())
        onDone()
      } else onDone((await api.twoFactorRecovery(password, code.trim())).recoveryCodes)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'disable' ? 'Отключить двухфакторную защиту' : 'Новые коды восстановления'}
      description="Подтвердите паролем и кодом из приложения (или кодом восстановления)"
    >
      <form onSubmit={submit} className="space-y-4">
        <FieldLabel label="Пароль">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </FieldLabel>
        <FieldLabel label="Код">
          <Input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" />
        </FieldLabel>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!password || !code.trim()}>
            {mode === 'disable' ? 'Отключить' : 'Выпустить новые'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
