import clsx from 'clsx'
import { CalendarClock } from 'lucide-react'
import { type Partner } from '@/shared/api'
import { daysLeft, relDate } from '@/shared/lib'

export function NextAction({ p }: { p: Partner }) {
  if (!p.next_action) return null
  const left = daysLeft(p.next_action_date)
  return (
    <div className={clsx('mt-2 flex items-center gap-1 text-[12px]', left != null && left < 0 ? 'text-bad' : left === 0 ? 'text-warn' : 'text-fg-3')}>
      <CalendarClock size={11} className="shrink-0" />
      <span className="truncate">
        {p.next_action}
        {p.next_action_date && ` · ${relDate(p.next_action_date)}`}
      </span>
    </div>
  )
}
