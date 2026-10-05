import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Copy, ExternalLink, Send } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api, useSetSetting, useSettings } from '@/shared/api'
import { Badge, Button, Card, CardHeader, FieldLabel, Select, Skeleton, Switch } from '@/shared/ui'

const timezones: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone')
  } catch {
    return ['Europe/Moscow', 'Europe/Kaliningrad', 'Europe/Samara', 'Asia/Yekaterinburg', 'Asia/Almaty', 'Asia/Novosibirsk', 'Asia/Vladivostok']
  }
})()

const digestHours = [
  { value: '-1', label: 'Не присылать' },
  ...[5, 6, 7, 8, 9, 10, 11, 12].map((h) => ({ value: String(h), label: `в ${String(h).padStart(2, '0')}:00` })),
]

export function Notifications() {
  const settings = useSettings()
  const set = useSetSetting()
  const qc = useQueryClient()
  const tg = useQuery({ queryKey: ['telegram'], queryFn: api.telegram })
  const [code, setCode] = useState<{ code: string; link: string | null } | null>(null)
  const [pending, setPending] = useState<'link' | 'unlink' | null>(null)

  const now = new Intl.DateTimeFormat('ru-RU', { timeZone: settings.timezone || undefined, hour: '2-digit', minute: '2-digit' }).format(new Date())

  const link = async () => {
    setPending('link')
    try {
      setCode(await api.telegramCode())
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPending(null)
    }
  }
  const unlink = async () => {
    setPending('unlink')
    try {
      await api.telegramUnlink()
      await qc.invalidateQueries({ queryKey: ['telegram'] })
      toast.success('Telegram отвязан')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPending(null)
    }
  }

  return (
    <Card className="lg:col-span-2" id="telegram">
      <CardHeader title="Telegram и уведомления" />
      <div className="grid gap-6 px-4 pb-4 md:grid-cols-2">
        <div className="space-y-4">
          <FieldLabel label="Часовой пояс" hint={`Сейчас у вас ${now}. От него зависят «сегодня», напоминания и утренняя сводка.`}>
            <Select
              value={settings.timezone ?? null}
              onChange={(v) => v && set.mutate({ key: 'timezone', value: v })}
              options={timezones.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))}
              searchable
            />
          </FieldLabel>
          <FieldLabel label="Утренняя сводка в Telegram" hint="Задачи, события и шаги по партнёрам на день">
            <Select
              value={String(settings.digest_hour ?? 8)}
              onChange={(v) => set.mutate({ key: 'digest_hour', value: Number(v ?? 8) })}
              options={digestHours}
            />
          </FieldLabel>
          <Switch
            checked={settings.reminders_enabled !== false}
            onChange={(v) => set.mutate({ key: 'reminders_enabled', value: v })}
            label="Напоминания о задачах"
            description="Сообщение в момент, когда наступает время задачи"
          />
        </div>

        <div className="rounded-[9px] border border-line p-4">
          <div className="mb-2 flex items-center gap-2">
            <Send size={16} className="text-info" />
            <span className="text-[13.5px] font-medium">Telegram-бот</span>
            {tg.isPending ? (
              <Skeleton className="h-[22px] w-20 rounded-full" />
            ) : tg.data?.linked ? (
              <Badge tone="good">привязан</Badge>
            ) : (
              <Badge>не привязан</Badge>
            )}
          </div>
          {tg.isPending ? (
            <div className="space-y-2.5">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="mt-3 h-9 w-44" />
            </div>
          ) : !tg.data?.enabled ? (
            <p className="text-[12.5px] leading-relaxed text-fg-3">
              Бот не настроен на сервере. Создайте бота у @BotFather и задайте переменную окружения{' '}
              <code className="rounded bg-surface-2 px-1">TELEGRAM_BOT_TOKEN</code> — инструкция в README.
            </p>
          ) : tg.data.linked ? (
            <div className="space-y-3">
              <p className="text-[12.5px] leading-relaxed text-fg-2">
                Пишите боту: <i>купить молоко завтра</i>, <i>расход 500 кафе</i>, <i>доход 120к зарплата</i>, <i>сегодня</i>, <i>привычки</i>.
              </p>
              <div className="flex flex-wrap gap-2">
                {tg.data.username && (
                  <a href={`https://t.me/${tg.data.username}`} target="_blank" rel="noreferrer">
                    <Button icon={ExternalLink}>Открыть @{tg.data.username}</Button>
                  </a>
                )}
                <Button variant="danger" onClick={unlink} loading={pending === 'unlink'}>
                  Отвязать
                </Button>
              </div>
            </div>
          ) : code ? (
            <div className="animate-[fade-in_250ms_ease-out] space-y-3 text-[12.5px] leading-relaxed text-fg-2">
              {code.link ? (
                <a href={code.link} target="_blank" rel="noreferrer">
                  <Button variant="primary" icon={ExternalLink}>
                    Открыть бота и привязать
                  </Button>
                </a>
              ) : null}
              <p>Или отправьте боту команду (код действует 15 минут):</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-[7px] bg-surface-2 px-2.5 py-1.5 text-[13.5px] text-fg">/start {code.code}</code>
                <Button
                  icon={Copy}
                  onClick={() => {
                    navigator.clipboard?.writeText(`/start ${code.code}`)
                    toast.success('Скопировано')
                  }}
                >
                  Копировать
                </Button>
              </div>
              <Button size="sm" variant="ghost" loading={tg.isFetching} onClick={() => qc.invalidateQueries({ queryKey: ['telegram'] })}>
                Я привязал — обновить
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[12.5px] leading-relaxed text-fg-2">Быстрый ввод задач и трат с телефона, отметка привычек, напоминания и утренняя сводка.</p>
              <Button variant="primary" icon={Send} onClick={link} loading={pending === 'link'}>
                Привязать Telegram
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
