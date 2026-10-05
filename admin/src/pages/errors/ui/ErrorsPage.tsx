import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/shared/api'
import { dateTime, num } from '@/shared/lib'
import { Badge, Button, Card, CardHeader, Empty, PageHeader, Segmented } from '@/shared/ui'
import { DailyBars } from '@/shared/ui/charts'

type Source = '' | 'server' | 'client'

export function ErrorsPage() {
  const qc = useQueryClient()
  const [source, setSource] = useState<Source>('')
  const [open, setOpen] = useState<number | null>(null)
  const [armed, setArmed] = useState(false)
  const { data } = useQuery({ queryKey: ['errors', source], queryFn: () => api.errors(source), refetchInterval: 30_000 })

  const clear = async () => {
    if (!armed) return setArmed(true)
    const { removed } = await api.clearErrors()
    await qc.invalidateQueries({ queryKey: ['errors'] })
    toast.success(`Удалено записей: ${removed}`)
    setArmed(false)
  }

  return (
    <>
      <PageHeader
        title="Ошибки"
        subtitle="Падения сервера и ошибки в браузерах пользователей. Хранятся 30 дней."
        actions={
          <Button variant="danger" onClick={clear} onBlur={() => setArmed(false)}>
            {armed ? 'Точно очистить?' : 'Очистить журнал'}
          </Button>
        }
      />
      <Card className="mb-5">
        <CardHeader title="Ошибок в день" sub={`${num(data?.daily.reduce((a, d) => a + d.value, 0) ?? 0)} за 30 дней`} />
        <div className="px-2 pb-3">{data && <DailyBars data={data.daily} name="Ошибок" color="var(--s8)" height={160} />}</div>
      </Card>
      <div className="mb-4">
        <Segmented
          value={source}
          onChange={setSource}
          options={[
            { value: '', label: 'Все' },
            { value: 'server', label: 'Сервер' },
            { value: 'client', label: 'Браузер' },
          ]}
        />
      </div>
      <Card>
        {!data?.items.length ? (
          <Empty title="Ошибок нет" />
        ) : (
          <div className="divide-y divide-line">
            {data.items.map((e) => (
              <div key={e.id}>
                <button
                  type="button"
                  onClick={() => setOpen(open === e.id ? null : e.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-hover"
                >
                  <Badge tone={e.source === 'server' ? 'bad' : 'warn'}>{e.source === 'server' ? 'Сервер' : 'Браузер'}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px]">{e.message}</div>
                    <div className="mt-0.5 text-[12px] text-fg-3">
                      {dateTime(e.created_at)}
                      {e.user && ` · @${e.user}`}
                      {typeof e.context?.path === 'string' && ` · ${e.context.method ?? ''} ${e.context.path}`}
                      {typeof e.context?.url === 'string' && e.context.url && ` · ${e.context.url}`}
                    </div>
                  </div>
                </button>
                {open === e.id && (
                  <pre className="overflow-x-auto border-t border-line bg-surface-2 px-4 py-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-fg-2">
                    {e.stack || 'Стек не сохранён'}
                    {e.context ? `\n\n${JSON.stringify(e.context, null, 2)}` : ''}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}
