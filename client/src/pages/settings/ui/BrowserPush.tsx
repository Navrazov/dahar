import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Bell, BellOff } from 'lucide-react'
import { api } from '@/shared/api'
import { currentPushSubscription, pushSupported, subscribePush } from '@/shared/lib'
import { Badge, Button, Card, CardHeader } from '@/shared/ui'

const KEY = ['push'] as const

/** Push в браузер и в установленное приложение: напоминания и сводка без Telegram. */
export function BrowserPush() {
  const qc = useQueryClient()
  const status = useQuery({ queryKey: KEY, queryFn: api.push })
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const supported = pushSupported()

  useEffect(() => {
    currentPushSubscription()
      .then((s) => setSubscribed(!!s))
      .catch(() => setSubscribed(false))
  }, [])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      await qc.invalidateQueries({ queryKey: KEY })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const enable = () =>
    run(async () => {
      if (!status.data?.publicKey) throw new Error('Сервер не настроен для уведомлений')
      const sub = await subscribePush(status.data.publicKey)
      await api.pushSubscribe(sub.toJSON())
      setSubscribed(true)
      toast.success('Уведомления включены на этом устройстве')
    })

  const disable = () =>
    run(async () => {
      const sub = await currentPushSubscription()
      if (sub) {
        await api.pushUnsubscribe(sub.endpoint)
        await sub.unsubscribe()
      }
      setSubscribed(false)
    })

  const test = () =>
    run(async () => {
      const { delivered } = await api.pushTest()
      if (!delivered) throw new Error('Не удалось доставить. Попробуйте выключить и включить уведомления')
    })

  return (
    <Card id="push">
      <CardHeader title="Уведомления в браузере" action={subscribed ? <Badge tone="good">Включены</Badge> : undefined} />
      <div className="space-y-3 px-4 pb-4 text-[13.5px] text-fg-2">
        <p>Напоминания о задачах и утренняя сводка — прямо на это устройство, без Telegram. На iPhone работает, если Dahar установлен на экран «Домой».</p>
        {!supported ? (
          <p className="text-fg-3">Этот браузер не поддерживает push-уведомления.</p>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {status.data && status.data.devices > 0 && (
              <span className="mr-auto text-[12.5px] text-fg-3">Устройств с уведомлениями: {status.data.devices}</span>
            )}
            {subscribed ? (
              <>
                <Button loading={busy} onClick={test}>
                  Проверить
                </Button>
                <Button variant="ghost" icon={BellOff} onClick={disable} disabled={busy}>
                  Выключить
                </Button>
              </>
            ) : (
              <Button variant="primary" icon={Bell} loading={busy || subscribed === null} onClick={enable}>
                Включить на этом устройстве
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
