import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { LoaderCircle, type LucideIcon } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-on-ink hover:bg-ink/85',
  secondary: 'border border-line bg-surface text-fg hover:border-line-strong hover:bg-hover',
  ghost: 'text-fg-2 hover:bg-hover hover:text-fg',
  danger: 'border border-line bg-surface text-bad hover:border-bad/40 hover:bg-bad-soft',
}

export function Button({
  variant = 'secondary',
  icon: Icon,
  className,
  children,
  loading = false,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: LucideIcon; loading?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex h-9 items-center justify-center gap-1.5 rounded-[7px] px-3.5 text-[13.5px] font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle size={15} className="animate-spin" /> : Icon && <Icon size={15} />}
      {children}
    </button>
  )
}

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('rounded-[10px] border border-line bg-surface', className)} {...rest}>
      {children}
    </div>
  )
}

export function CardHeader({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 pb-2.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <h3 className="truncate text-[14px] font-semibold tracking-[-0.01em]">{title}</h3>
        {sub != null && <span className="text-[13px] text-fg-3 tabular">{sub}</span>}
      </div>
      {action}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.025em]">{title}</h1>
        {subtitle && <div className="mt-1.5 text-[14px] text-fg-2">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

export function Empty({ title, hint }: { title: ReactNode; hint?: ReactNode }) {
  return (
    <div className="px-6 py-10 text-center">
      <div className="text-[14px] font-medium text-fg-2">{title}</div>
      {hint && <div className="mt-1 text-[13px] text-fg-3">{hint}</div>}
    </div>
  )
}

const tones = {
  gray: 'bg-surface-2 text-fg-2',
  good: 'bg-good-soft text-good',
  bad: 'bg-bad-soft text-bad',
  warn: 'bg-warn-soft text-warn',
  accent: 'bg-accent-soft text-accent-text',
}

export function Badge({ tone = 'gray', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={clsx('inline-flex h-[22px] items-center rounded-full px-2 text-[12px] font-medium whitespace-nowrap', tones[tone])}>{children}</span>
}

export const controlCls =
  'h-9 w-full rounded-[7px] border border-line bg-surface px-3 text-[14px] text-fg placeholder:text-fg-3 outline-none transition-[border-color,box-shadow] hover:border-line-strong focus:border-accent focus:ring-[3px] focus:ring-accent/15'

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(controlCls, className)} {...rest} />
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12.5px] font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-fg-3">{hint}</span>}
    </label>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-[8px] bg-surface-2 p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'h-[30px] rounded-[6px] px-3 text-[13px] font-medium',
            value === o.value ? 'bg-surface text-fg shadow-[0_1px_2px_rgb(0_0_0/0.07)]' : 'text-fg-2 hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Table({ children, maxHeight }: { children: ReactNode; maxHeight?: number }) {
  return (
    <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full border-collapse text-[13.5px] [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-surface [&_td]:border-t [&_td]:border-line [&_td]:px-4 [&_td]:py-2.5 [&_th]:px-4 [&_th]:py-2 [&_th]:text-left [&_th]:text-[12px] [&_th]:font-medium [&_th]:whitespace-nowrap [&_th]:text-fg-3">
        {children}
      </table>
    </div>
  )
}

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line">
      {items.map(([k, v], i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-[13.5px]">
          <dt className="text-fg-2">{k}</dt>
          <dd className="min-w-0 text-right break-words tabular">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
