export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4.5 15.5a7.5 7.5 0 0 1 15 0z" fill="var(--accent)" />
        <path d="M2.5 19h19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="text-[17px] font-semibold tracking-[-0.03em]">Dahar</span>
      <span className="rounded-[5px] bg-ink px-1.5 py-0.5 text-[11px] font-medium text-on-ink">админка</span>
    </span>
  )
}
