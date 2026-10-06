import { addDays, parseISO } from 'date-fns'
import { useEditor } from '@/features/edit-record'
import { ymd } from '@/shared/lib'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { RefreshCw, Sparkles } from 'lucide-react'
import { api, type WeeklyInsight } from '@/shared/api'
import { relDate } from '@/shared/lib'
import { Button, Card, CardHeader, Skeleton } from '@/shared/ui'

function List({ title, items, add }: { title: string; items: string[]; add?: (text: string) => void }) {
  if (!items.length) return null
  return (
    <div>
      <div className="mb-1 text-[12.5px] font-medium text-fg-3">{title}</div>
      <ul className="list-disc space-y-1 pl-5 text-[14px]">
        {items.map((it, i) => (
          <li key={i}>
            {it}
            {add && (
              <Button size="sm" variant="ghost" onClick={() => add(it)}>
                В план
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Body({ insight, week }: { insight: WeeklyInsight; week: string }) {
  const edit = useEditor()
  const add = (text: string) => edit('tasks', { title: text.slice(0, 200), description: text, due_date: ymd(addDays(parseISO(week), 7)), status: 'todo' })
  return (
    <div className="space-y-4 text-[14px] leading-relaxed">
      <p>{insight.summary}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <List title="Что получилось" items={insight.wins} />
        <List title="На что обратить внимание" items={insight.attention} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1 text-[12.5px] font-medium text-fg-3">Деньги</div>
          <p>{insight.money}</p>
        </div>
        <div>
          <div className="mb-1 text-[12.5px] font-medium text-fg-3">Привычки</div>
          <p>{insight.habits}</p>
        </div>
      </div>
      <List title="Шаги на следующую неделю" items={insight.next_week} add={add} />
    </div>
  )
}

/** Разбор недели от Claude: по кнопке, потому что данные недели уходят во внешний сервис. */
export function WeekInsight({ week }: { week: string }) {
  const qc = useQueryClient()
  const key = ['insight', week]
  const q = useQuery({ queryKey: key, queryFn: () => api.insight(week) })
  const run = useMutation({
    mutationFn: () => api.createInsight(week),
    onSuccess: (insight) => {
      qc.setQueryData(key, { enabled: true, insight })
      void qc.invalidateQueries({ queryKey: key })
    },
    onError: (e) => toast.error((e as Error).message),
  })

  if (q.data && !q.data.enabled) return null
  const insight = q.data?.insight

  return (
    <Card>
      <CardHeader
        title="Разбор недели"
        sub={insight ? `от ${relDate(insight.created_at).toLowerCase()}` : undefined}
        action={
          insight ? (
            <Button size="sm" variant="ghost" icon={RefreshCw} loading={run.isPending} onClick={() => run.mutate()}>
              Обновить
            </Button>
          ) : undefined
        }
      />
      <div className="px-4 pb-4">
        {q.data?.quota && (
          <p className="mb-3 text-xs text-fg-3">
            Осталось AI-разборов в этом месяце: {q.data.quota.remaining} из {q.data.quota.max}. При ошибке месячная квота возвращается.
          </p>
        )}
        {!q.data ? (
          <Skeleton className="h-20 rounded-[8px]" />
        ) : run.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : insight ? (
          <Body insight={insight} week={week} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 text-[13.5px] text-fg-2">
            <p className="max-w-xl">
              Claude посмотрит на задачи, привычки, деньги и проекты за неделю и подскажет, что получилось, что просело и что сделать дальше. Данные недели
              отправятся в Anthropic только по нажатию кнопки.
            </p>
            <Button variant="primary" icon={Sparkles} onClick={() => run.mutate()}>
              Разобрать неделю
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
