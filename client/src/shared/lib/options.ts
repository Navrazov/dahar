export type Tone = 'gray' | 'accent' | 'good' | 'warn' | 'bad' | 'info'

export type Option = { value: string; label: string; tone?: Tone }

export const label = (opts: Option[], v: string | null | undefined) => opts.find((o) => o.value === v)?.label ?? '—'

export const tone = (opts: Option[], v: string | null | undefined): Tone => opts.find((o) => o.value === v)?.tone ?? 'gray'
