import type { ReactNode } from 'react'
import clsx from 'clsx'

/** Карточка-список в духе iOS: строки разделены линией, без внешних отступов. */
export function Rows({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-surface', className)}>{children}</div>
}

export function Group({ title, tone, children, action }: { title?: string; tone?: 'bad'; children: ReactNode; action?: ReactNode }) {
  return (
    <section>
      {(title || action) && (
        <div className="mb-2 flex items-baseline justify-between px-1">
          {title && <h2 className={clsx('text-[13px] font-medium', tone === 'bad' ? 'text-bad' : 'text-fg-3')}>{title}</h2>}
          {action}
        </div>
      )}
      <Rows>{children}</Rows>
    </section>
  )
}
