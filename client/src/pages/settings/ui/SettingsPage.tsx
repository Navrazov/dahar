import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import clsx from 'clsx'
import { Copy, Download, ExternalLink, Send, Upload } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api, type ModuleKey, type Settings, useList, useSave, useSetSetting, useSettings } from '@/shared/api'
import { Badge, Button, Card, CardHeader, FieldLabel, Input, PageHeader, Select, Skeleton, Switch } from '@/shared/ui'
import { isEnabled, moduleCatalog, moduleLabel } from '@/entities/module'
import { useUser } from '@/entities/session'
import { seedDemo } from '../model/seed'
import { SettingControl, type SettingItem } from '@/features/module-settings'
import { useModuleToggle } from '@/features/toggle-module'

const general: SettingItem[] = [
  { key: 'currency', label: 'Основная валюта', type: 'currency', hint: 'Финансы и бизнес' },
  { key: 'trading_currency', label: 'Валюта трейдинга', type: 'currency' },
]

export function SettingsPage() {
  const { hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  return (
    <>
      <PageHeader title="Настройки" />
      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        <Profile />
        <Password />
        <Notifications />
        <Modules />
        <Data />
      </div>
    </>
  )
}

function Profile() {
  const user = useUser()
  const settings = useSettings()
  const set = useSetSetting()
  const [draft, setDraft] = useState<Settings>({})
  useEffect(() => {
    setDraft(settings)
  }, [settings])

  const save = async () => {
    for (const k of ['user_name', ...general.map((g) => g.key)] as (keyof Settings)[]) {
      if (draft[k] !== settings[k]) await set.mutateAsync({ key: k, value: draft[k] ?? null })
    }
    toast.success('Сохранено')
  }

  return (
    <Card>
      <CardHeader title="Профиль" sub={`@${user.login}`} />
      <div className="space-y-4 px-4 pb-4">
        <FieldLabel label="Как к вам обращаться">
          <Input value={draft.user_name ?? ''} onChange={(e) => setDraft({ ...draft, user_name: e.target.value })} placeholder={user.name || 'Имя для приветствия'} />
        </FieldLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          {general.map((g) => (
            <FieldLabel key={g.key} label={g.label} hint={g.hint}>
              <SettingControl item={g} value={draft[g.key] ?? (g.key === 'currency' ? '₽' : '$')} onChange={(v) => setDraft((d) => ({ ...d, [g.key]: v }))} />
            </FieldLabel>
          ))}
        </div>
        <div className="flex justify-end">
          <Button variant="primary" onClick={save}>
            Сохранить
          </Button>
        </div>
      </div>
    </Card>
  )
}

function Password() {
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

function Modules() {
  const settings = useSettings()
  const toggle = useModuleToggle()
  const set = useSetSetting()
  const saveProject = useSave('projects')
  const projects = useList('projects')
  const [labels, setLabels] = useState<Partial<Record<ModuleKey, string>>>({})

  const enable = async (key: ModuleKey, on: boolean) => {
    await toggle(key, { enabled: on })
    const def = moduleCatalog.find((m) => m.key === key)!
    if (on && def.projectSetting && !settings[def.projectSetting]) {
      const project = await saveProject.mutateAsync({ name: moduleLabel(settings, key), status: 'active', area: 'Направления', color: '#5b5bd6' })
      await set.mutateAsync({ key: def.projectSetting, value: project.id })
      toast.success(`Подключено. Создан проект «${project.name}»`)
    } else toast.success(on ? 'Направление подключено' : 'Направление отключено. Данные сохранены')
  }

  return (
    <Card className="lg:col-span-2" id="modules">
      <CardHeader title="Направления" sub="какие разделы видны в меню" />
      <p className="px-4 pb-3 text-[12.5px] text-fg-3">Отключение только скрывает раздел — данные остаются. Направление можно переименовать: например, «Бизнес» → «Парфюм-бизнес».</p>
      <div className="grid gap-3 px-4 pb-4 md:grid-cols-2 xl:grid-cols-3">
        {moduleCatalog.map((m) => {
          const on = isEnabled(settings, m.key)
          const linked = m.projectSetting ? projects.find((p) => p.id === settings[m.projectSetting!]) : null
          return (
            <div key={m.key} className={clsx('flex flex-col gap-3 rounded-[9px] border p-3 transition-colors', on ? 'border-accent/40 bg-accent-soft/30' : 'border-line')}>
              <div className="flex items-start gap-3">
                <div className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px]', on ? 'bg-ink text-on-ink' : 'bg-surface-2 text-fg-3')}>
                  <m.icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium">{moduleLabel(settings, m.key)}</div>
                  <div className="text-[12.5px] text-fg-3">{m.description}</div>
                </div>
                <Switch checked={on} onChange={(v) => enable(m.key, v)} />
              </div>
              {on && (
                <div className="flex flex-col gap-2 border-t border-line pt-3">
                  <Input
                    value={labels[m.key] ?? settings.modules?.[m.key]?.label ?? ''}
                    placeholder={`Название: ${m.label}`}
                    onChange={(e) => setLabels((l) => ({ ...l, [m.key]: e.target.value }))}
                    onBlur={() => labels[m.key] !== undefined && toggle(m.key, { label: labels[m.key] || null })}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                  {m.projectSetting && (
                    <SettingControl item={{ key: m.projectSetting, label: 'Проект', type: 'project' }} value={settings[m.projectSetting] ?? null} onChange={(v) => set.mutate({ key: m.projectSetting!, value: v })} />
                  )}
                  {m.projectSetting && <span className="text-[12px] text-fg-3">{linked ? 'Новые записи привязываются к этому проекту' : 'Без проекта записи не попадут на страницу проекта'}</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function Data() {
  const qc = useQueryClient()
  const projects = useList('projects')
  const [busy, setBusy] = useState(false)

  const restore = async (file?: File) => {
    if (!file) return
    try {
      const json = JSON.parse(await file.text())
      await api.restore(json)
      await qc.invalidateQueries()
      toast.success('Данные восстановлены из резервной копии')
    } catch (e) {
      toast.error('Не удалось восстановить: ' + (e as Error).message)
    }
  }

  const demo = async () => {
    setBusy(true)
    const id = toast.loading('Загружаю пример данных…')
    try {
      await seedDemo()
      await qc.invalidateQueries()
      toast.success('Пример загружен, загляните на главную', { id })
    } catch (e) {
      toast.error('Ошибка: ' + (e as Error).message, { id })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader title="Данные" />
      <div className="flex flex-wrap gap-2 px-4 pb-3">
        <a href="/api/backup" download>
          <Button icon={Download}>Скачать резервную копию</Button>
        </a>
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[7px] border border-line bg-surface px-3.5 text-[13.5px] font-medium hover:border-line-strong hover:bg-hover">
          <Upload size={15} /> Восстановить из копии
          <input type="file" accept="application/json" hidden onChange={(e) => restore(e.target.files?.[0])} />
        </label>
        {!projects.length && (
          <Button onClick={demo} loading={busy}>
            Загрузить пример данных
          </Button>
        )}
      </div>
      <p className="px-4 pb-4 text-[12.5px] text-fg-3">Копия содержит только ваши данные. Восстановление полностью заменяет текущие данные вашего аккаунта.</p>
    </Card>
  )
}

const timezones: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone')
  } catch {
    return ['Europe/Moscow', 'Europe/Kaliningrad', 'Europe/Samara', 'Asia/Yekaterinburg', 'Asia/Almaty', 'Asia/Novosibirsk', 'Asia/Vladivostok']
  }
})()

const digestHours = [{ value: '-1', label: 'Не присылать' }, ...[5, 6, 7, 8, 9, 10, 11, 12].map((h) => ({ value: String(h), label: `в ${String(h).padStart(2, '0')}:00` }))]

function Notifications() {
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
            <Select value={String(settings.digest_hour ?? 8)} onChange={(v) => set.mutate({ key: 'digest_hour', value: Number(v ?? 8) })} options={digestHours} />
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
            {tg.isPending ? <Skeleton className="h-[22px] w-20 rounded-full" /> : tg.data?.linked ? <Badge tone="good">привязан</Badge> : <Badge>не привязан</Badge>}
          </div>
          {tg.isPending ? (
            <div className="space-y-2.5">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="mt-3 h-9 w-44" />
            </div>
          ) : !tg.data?.enabled ? (
            <p className="text-[12.5px] leading-relaxed text-fg-3">
              Бот не настроен на сервере. Создайте бота у @BotFather и задайте переменную окружения <code className="rounded bg-surface-2 px-1">TELEGRAM_BOT_TOKEN</code> — инструкция в README.
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
              <p>
                Или отправьте боту команду (код действует 15 минут):
              </p>
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
