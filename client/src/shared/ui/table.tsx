import type { ReactNode } from 'react'
import clsx from 'clsx'

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-[13.5px] [&_td]:border-t [&_td]:border-line [&_td]:px-4 [&_td]:py-2.5 [&_td.tabular]:whitespace-nowrap [&_th]:px-4 [&_th]:py-2 [&_th]:text-left [&_th]:text-[12px] [&_th]:font-medium [&_th]:whitespace-nowrap [&_th]:text-fg-3">
        {children}
      </table>
    </div>
  )
}
