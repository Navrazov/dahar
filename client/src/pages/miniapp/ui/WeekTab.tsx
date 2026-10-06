import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { addDays, addWeeks, format, parseISO, startOfISOWeek } from 'date-fns'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { api, collectionKey, useListWhere, useSave, type Review } from '@/shared/api'
import { accountNow, ymd } from '@/shared/lib'
import { Button, FieldLabel, IconButton, Textarea } from '@/shared/ui'
import { useUser } from '@/entities/session'

export function WeekTab() {
  const current = ymd(startOfISOWeek(accountNow())),
    [week, setWeek] = useState(current)
  useEffect(() => {
    void api.activation('weekly_review_opened').catch(() => {})
  }, [])
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <IconButton icon={ChevronLeft} label="Предыдущая неделя" onClick={() => setWeek(ymd(addWeeks(parseISO(week), -1)))} />
        <span className="text-sm font-medium">
          {format(parseISO(week), 'd MMM')} — {format(addDays(parseISO(week), 6), 'd MMM yyyy')}
        </span>
        <IconButton icon={ChevronRight} label="Следующая неделя" disabled={week >= current} onClick={() => setWeek(ymd(addWeeks(parseISO(week), 1)))} />
      </div>
      <WeekDraft key={week} week={week} />
      <Link to="/review/advanced" className="block min-h-11 py-3 text-center text-sm text-accent">
        Подробный обзор и AI →
      </Link>
    </div>
  )
}
function WeekDraft({ week }: { week: string }) {
  const reviews = useListWhere('reviews', { week_start: week }),
    counts = useQuery({ queryKey: [...collectionKey('tasks'), 'mini-week', week], queryFn: ({ signal }) => api.miniWeek(week, signal) }),
    save = useSave('reviews'),
    user = useUser()
  const existing = reviews[0]
  const completed = counts.data?.completed ?? 0,
    late = counts.data?.remaining_due ?? 0
  const key = `review-draft:${user.id}:${week}`,
    edited = useRef(false)
  const [draft, setDraft] = useState<Partial<Review>>(() => {
    try {
      const cached = localStorage.getItem(key)
      if (cached) {
        edited.current = true
        return JSON.parse(cached)
      }
    } catch {
      /* storage unavailable */
    }
    return existing ?? {}
  })
  useEffect(() => {
    if (!edited.current) setDraft(existing ?? {})
  }, [existing])
  useEffect(() => {
    if (edited.current) {
      try {
        localStorage.setItem(key, JSON.stringify(draft))
      } catch {
        /* storage unavailable */
      }
    }
  }, [draft, key])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (edited.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])
  const update = (patch: Partial<Review>) => {
    edited.current = true
    setDraft((d) => ({ ...d, ...patch }))
  }
  const dirty = ['wins', 'focus', 'problems', 'lessons', 'rating'].some((k) => (draft[k as keyof Review] ?? '') !== (existing?.[k as keyof Review] ?? ''))
  const submit = async () => {
    try {
      await save.mutateAsync({
        id: existing?.id,
        week_start: week,
        wins: draft.wins,
        focus: draft.focus,
        problems: draft.problems,
        lessons: draft.lessons,
        rating: draft.rating,
      })
      edited.current = false
      try {
        localStorage.removeItem(key)
      } catch {
        /* storage unavailable */
      }
      toast.success('Итоги недели сохранены')
    } catch {
      /* MutationCache displays the error; keep the draft. */
    }
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="text-2xl font-semibold">{completed}</div>
          <div className="text-xs text-fg-3">задач выполнено</div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="text-2xl font-semibold">{late}</div>
          <div className="text-xs text-fg-3">дел этой недели до сегодня осталось</div>
        </div>
      </div>
      <div className="space-y-4 rounded-[14px] border border-line bg-surface p-4">
        <FieldLabel label="Оценка недели" group>
          <div role="radiogroup" aria-label="Оценка недели" className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={draft.rating === n}
                aria-label={`${n} из 5`}
                onClick={() => update({ rating: n === draft.rating ? null : n })}
                className={`h-11 min-w-11 rounded-xl border text-base ${draft.rating === n ? 'border-accent bg-accent text-white' : 'border-line'}`}
              >
                {n}
              </button>
            ))}
          </div>
        </FieldLabel>
        <FieldLabel label="Что получилось">
          <Textarea
            value={draft.wins ?? ''}
            maxLength={10000}
            placeholder="Один результат, которым доволен"
            onChange={(e) => update({ wins: e.target.value })}
          />
        </FieldLabel>
        <FieldLabel label="Главное на следующую неделю">
          <Textarea
            value={draft.focus ?? ''}
            maxLength={10000}
            placeholder="На чём хочешь сосредоточиться"
            onChange={(e) => update({ focus: e.target.value })}
          />
        </FieldLabel>
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-sm text-fg-3">Что мешало и выводы</summary>
          <div className="space-y-3">
            <FieldLabel label="Что мешало">
              <Textarea value={draft.problems ?? ''} maxLength={10000} onChange={(e) => update({ problems: e.target.value })} />
            </FieldLabel>
            <FieldLabel label="Выводы">
              <Textarea value={draft.lessons ?? ''} maxLength={10000} onChange={(e) => update({ lessons: e.target.value })} />
            </FieldLabel>
          </div>
        </details>
        <Button className="h-11 w-full" variant="primary" loading={save.isPending} disabled={!dirty || !navigator.onLine} onClick={() => void submit()}>
          Сохранить итоги
        </Button>
        <p className="text-xs text-fg-3">
          {dirty
            ? 'Черновик сохраняется на этом устройстве. Нажми «Сохранить итоги», чтобы отправить его в Dahar.'
            : 'Достаточно пары предложений, чтобы понять свой следующий шаг.'}
        </p>
      </div>
    </>
  )
}
