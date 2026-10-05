import clsx from 'clsx'

export function LogoMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={clsx('shrink-0', className)} aria-hidden>
      <path d="M4.5 15.5a7.5 7.5 0 0 1 15 0z" fill="var(--accent)" />
      <path d="M2.5 19h19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
