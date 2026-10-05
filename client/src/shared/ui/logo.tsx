import clsx from 'clsx'

export function LogoMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={clsx('shrink-0', className)} aria-hidden>
      <path d="M10 43h9l-.9-26h-7.2zM10.4 16h8.2l-1.9-4.2h-4.4zM12.6 10.8h3.8L14.5 6z" fill="currentColor" />
      <path d="M22.5 12a15.5 15.5 0 0 1 0 31z" fill="var(--accent)" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx('flex items-center gap-2 text-fg', className)}>
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-[-0.03em]">Dahar</span>
    </span>
  )
}
