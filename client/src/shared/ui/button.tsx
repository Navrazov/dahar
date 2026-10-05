import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-on-ink hover:bg-ink/85',
  accent: 'bg-accent text-white hover:bg-accent-hover',
  secondary: 'border border-line bg-surface text-fg hover:border-line-strong hover:bg-hover',
  ghost: 'text-fg-2 hover:bg-hover hover:text-fg',
  danger: 'text-bad hover:bg-bad-soft',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-[7px] font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-9 px-3.5 text-[13.5px]',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 15} strokeWidth={2} />}
      {children}
    </button>
  )
}

export function IconButton({ icon: Icon, label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] text-fg-3 transition-colors hover:bg-hover hover:text-fg', className)}
      {...rest}
    >
      <Icon size={16} />
    </button>
  )
}

export function ConfirmButton({ onConfirm, children = 'Удалить', className }: { onConfirm: () => void; children?: ReactNode; className?: string }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <Button variant="danger" className={className} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? 'Точно удалить?' : children}
    </Button>
  )
}
