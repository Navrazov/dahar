import { type ReactNode } from 'react'
import clsx from 'clsx'

export const controlCls =
  'w-full rounded-[7px] border border-line bg-surface text-[14px] text-fg placeholder:text-fg-3 outline-none transition-[border-color,box-shadow] hover:border-line-strong focus:border-accent focus:ring-[3px] focus:ring-accent/15 disabled:opacity-50'

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: ReactNode
  description?: ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1 select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-ink' : 'bg-line-strong')}
      >
        <span className={clsx('absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-surface shadow transition-transform', checked && 'translate-x-4')} />
      </button>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-[14px]">{label}</span>}
          {description && <span className="block text-[12.5px] text-fg-3">{description}</span>}
        </span>
      )}
    </label>
  )
}

/**
 * Подпись поля. По умолчанию — настоящий <label>, чтобы у поля было доступное имя.
 * `group` — для набора кнопок (дни, цвета): клик по подписи не должен нажимать первую из них.
 */
export function FieldLabel({
  label,
  children,
  className,
  hint,
  group,
}: {
  label: string
  children: ReactNode
  className?: string
  hint?: ReactNode
  group?: boolean
}) {
  const body = (
    <>
      <span className="text-[12.5px] font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-fg-3">{hint}</span>}
    </>
  )
  return group ? (
    <div role="group" aria-label={label} className={clsx('flex flex-col gap-1', className)}>
      {body}
    </div>
  ) : (
    <label className={clsx('flex flex-col gap-1', className)}>{body}</label>
  )
}
