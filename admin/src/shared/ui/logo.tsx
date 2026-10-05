export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <svg width="22" height="22" viewBox="0 0 48 48" fill="none" aria-hidden>
        <path d="M10 43h9l-.9-26h-7.2zM10.4 16h8.2l-1.9-4.2h-4.4zM12.6 10.8h3.8L14.5 6z" fill="currentColor" />
        <path d="M22.5 12a15.5 15.5 0 0 1 0 31z" fill="var(--accent)" />
      </svg>
      <span className="text-[17px] font-semibold tracking-[-0.03em]">Dahar</span>
      <span className="rounded-[5px] bg-ink px-1.5 py-0.5 text-[11px] font-medium text-on-ink">админка</span>
    </span>
  )
}
