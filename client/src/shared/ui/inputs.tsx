import { useLayoutEffect, useRef } from 'react'
import clsx from 'clsx'
import { Search, X } from 'lucide-react'
import { controlCls } from './fields'

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(controlCls, 'h-9 px-3', className)} {...rest} />
}

export function Textarea({ className, value, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight + 2, 320)}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      rows={3}
      className={clsx(controlCls, 'block min-h-[72px] resize-none px-2.5 py-1.5 leading-relaxed', className)}
      {...rest}
    />
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Поиск…',
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={clsx('relative w-full sm:w-60', className)}>
      <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pr-7 pl-8" />
      {value && (
        <button
          type="button"
          aria-label="Очистить"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-fg-3 hover:text-fg"
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}
