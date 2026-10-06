import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { request, pendingCount, failedChanges } from '@/shared/api'
import { wipeLocalData } from '@/shared/lib'
import { Button, Card, CardHeader, FieldLabel, Input } from '@/shared/ui'
import { signOutLocally } from '@/entities/session'

type Session = { id: string; current: boolean; created_at: string; ip: string | null; user_agent: string | null }
type Subscription = {
  status: 'active' | 'trial' | 'expired' | 'pilot'
  trial_ends_at: string | null
  paid_until: string | null
  monthly_rub: number
  yearly_rub: number
}

export function Account() {
  const qc = useQueryClient()
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => request<Session[]>('/api/auth/sessions'), meta: { persist: false } })
  const subscription = useQuery({ queryKey: ['subscription'], queryFn: () => request<Subscription>('/api/subscription') })
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [deleting, setDeleting] = useState(false)
  const revoke = useMutation({
    mutationFn: (id?: string) => request(id ? `/api/auth/sessions/${id}` : '/api/auth/sessions/revoke-others', { method: id ? 'DELETE' : 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
  const remove = async () => {
    if ((await pendingCount()) || (await failedChanges()).length) return toast.error('Сначала сохраните или разберите офлайн-изменения')
    if (!window.confirm('Удалить аккаунт и все данные навсегда? Сначала скачайте резервную копию.')) return
    setDeleting(true)
    try {
      await request('/api/auth/account', { method: 'DELETE', body: JSON.stringify({ password, code, confirm: 'delete' }) })
      signOutLocally(qc)
      await wipeLocalData()
      toast.success('Аккаунт удалён')
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setDeleting(false)
    }
  }
  return (
    <Card className="lg:col-span-2">
      <CardHeader title="Аккаунт и доступ" />
      <div className="space-y-5 px-4 pb-4 text-sm">
        {subscription.data && (
          <div>
            <p>
              {subscription.data.status === 'active'
                ? 'Подписка активна'
                : subscription.data.status === 'trial'
                  ? 'Пробный период'
                  : subscription.data.status === 'expired'
                    ? 'Пробный период завершён. Доступ пилота пока сохранён'
                    : 'Доступ закрытого пилота'}
            </p>
            {subscription.data.trial_ends_at && (
              <p className="text-fg-2">Пробный период до {new Date(subscription.data.trial_ends_at).toLocaleDateString('ru-RU')}</p>
            )}
            {subscription.data.paid_until && <p>Оплачено до {new Date(subscription.data.paid_until).toLocaleDateString('ru-RU')}</p>}
            <p className="mt-1 text-fg-2">
              Планируемый тариф: {subscription.data.monthly_rub} ₽/месяц или {subscription.data.yearly_rub} ₽/год. Приём платежей пока не открыт.
            </p>
          </div>
        )}
        <div>
          <h3 className="mb-2 font-medium">Активные сессии</h3>
          {sessions.data?.map((session) => (
            <div key={session.id} className="flex items-center justify-between gap-3 border-b border-line py-2">
              <div className="min-w-0">
                <p className="truncate">{session.current ? 'Это устройство' : session.user_agent || 'Другое устройство'}</p>
                <p className="text-xs text-fg-3">
                  {session.ip} · вход {new Date(session.created_at).toLocaleDateString('ru-RU')}
                </p>
              </div>
              {!session.current && (
                <Button size="sm" loading={revoke.isPending} onClick={() => revoke.mutate(session.id)}>
                  Завершить
                </Button>
              )}
            </div>
          ))}
          <Button className="mt-3" loading={revoke.isPending} onClick={() => revoke.mutate(undefined)}>
            Выйти на других устройствах
          </Button>
        </div>
        <div className="border-t border-line pt-4">
          <h3 className="font-medium">Удалить аккаунт</h3>
          <p className="mt-1 mb-3 text-fg-2">
            Скачайте копию в разделе «Данные и история». Удаление записей необратимо; копии сервиса удаляются по сроку хранения.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldLabel label="Пароль">
              <Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </FieldLabel>
            <FieldLabel label="Код 2FA, если защита включена">
              <Input value={code} autoComplete="one-time-code" onChange={(event) => setCode(event.target.value)} />
            </FieldLabel>
          </div>
          <Button className="mt-3" disabled={!password} loading={deleting} onClick={remove}>
            Удалить аккаунт и данные
          </Button>
        </div>
      </div>
    </Card>
  )
}
