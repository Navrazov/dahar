import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Command } from 'cmdk'
import { DayPicker } from 'react-day-picker'
import { ru } from 'react-day-picker/locale'
import { addDays, format } from 'date-fns'
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Search, X } from 'lucide-react'
import { PopoverPanel } from './overlay'
import { parse, todayStr, ymd } from '../lib/date'

export const controlCls =
  'w-full rounded-[7px] border border-line bg-surface text-[14px] text-fg placeholder:text-fg-3 outline-none transition-[border-color,box-shadow] hover:border-line-strong focus:border-accent focus:ring-[3px] focus:ring-accent/15 disabled:opacity-50'

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
  return <textarea ref={ref} value={value} rows={3} className={clsx(controlCls, 'block min-h-[72px] resize-none px-2.5 py-1.5 leading-relaxed', className)} {...rest} />
}

export function SearchInput({ value, onChange, placeholder = 'Поиск…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={clsx('relative w-full sm:w-60', className)}>
      <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pr-7 pl-8" />
      {value && (
        <button type="button" aria-label="Очистить" onClick={() => onChange('')} className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-fg-3 hover:text-fg">
          <X size={13} />
        </button>
      )}
    </div>
  )
}

export type SelectOption = { value: string; label: string; dot?: string | null; hint?: string }

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Выберите…',
  clearable,
  clearLabel = 'Не выбрано',
  searchable,
  className,
  disabled,
  autoFocus,
}: {
  value: string | null | undefined
  onChange: (v: string | null) => void
  options: SelectOption[]
  placeholder?: string
  clearable?: boolean
  clearLabel?: string
  searchable?: boolean
  className?: string
  disabled?: boolean
  autoFocus?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === (value ?? ''))
  const showSearch = searchable ?? options.length > 8
  const key = (o: SelectOption) => `${o.label}\u0000${o.value}`
  const pick = (v: string | null) => {
    onChange(v)
    setOpen(false)
  }

  return (
    <PopoverPanel
      open={open}
      onOpenChange={setOpen}
      matchWidth
      className="min-w-52"
      trigger={
        <button
          type="button"
          disabled={disabled}
          data-autofocus={autoFocus ? '' : undefined}
          className={clsx(controlCls, 'flex h-9 items-center gap-2 px-3 text-left', open && 'border-accent ring-2 ring-accent/15', className)}
        >
          {selected?.dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: selected.dot }} />}
          <span className={clsx('min-w-0 flex-1 truncate', !selected && 'text-fg-3')}>{selected ? selected.label : placeholder}</span>
          <ChevronDown size={14} className={clsx('shrink-0 text-fg-3 transition-transform', open && 'rotate-180')} />
        </button>
      }
    >
      <Command defaultValue={selected ? key(selected) : undefined} loop className="flex max-h-[min(340px,var(--radix-popover-content-available-height))] flex-col">
        {showSearch && (
          <div className="flex items-center gap-2 border-b border-line px-2.5">
            <Search size={14} className="shrink-0 text-fg-3" />
            <Command.Input autoFocus placeholder="Поиск…" className="h-9 w-full bg-transparent text-[13px] outline-none placeholder:text-fg-3" />
          </div>
        )}
        <Command.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
          <Command.Empty className="px-2 py-6 text-center text-xs text-fg-3">Ничего не найдено</Command.Empty>
          {clearable && (
            <Command.Item value={`\u0001${clearLabel}`} onSelect={() => pick(null)} className={itemCls}>
              <span className="flex-1 text-fg-3">{clearLabel}</span>
              {!selected && <Check size={14} className="text-accent" />}
            </Command.Item>
          )}
          {options.map((o) => (
            <Command.Item key={o.value} value={key(o)} keywords={[o.label]} onSelect={() => pick(o.value)} className={itemCls}>
              {o.dot !== undefined && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: o.dot || 'var(--text-3)' }} />}
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.hint && <span className="shrink-0 text-xs text-fg-3">{o.hint}</span>}
              {selected?.value === o.value && <Check size={14} className="shrink-0 text-accent" />}
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </PopoverPanel>
  )
}

const itemCls = 'flex h-8 cursor-pointer items-center gap-2 rounded-[6px] px-2 text-[13.5px] outline-none select-none data-[selected=true]:bg-hover'

const intoPopover = (e: React.FocusEvent) => !!(e.relatedTarget as HTMLElement | null)?.closest('[data-radix-popper-content-wrapper]')

const isoToText = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '')

function maskDate(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 8)
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('.')
}

function textToIso(text: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text)
  if (!m) return null
  const iso = `${m[3]}-${m[2]}-${m[1]}`
  const d = parse(iso)
  return d && ymd(d) === iso ? iso : null
}

const dayPickerClasses = {
  root: 'p-3 select-none',
  months: 'relative',
  month: 'space-y-2',
  month_caption: 'flex h-7 items-center justify-center text-[13px] font-semibold capitalize',
  nav: 'absolute inset-x-0 top-0 z-10 flex h-7 items-center justify-between',
  button_previous: 'flex h-7 w-7 items-center justify-center rounded-md text-fg-2 hover:bg-hover disabled:opacity-30',
  button_next: 'flex h-7 w-7 items-center justify-center rounded-md text-fg-2 hover:bg-hover disabled:opacity-30',
  month_grid: 'border-collapse',
  weekday: 'h-8 w-9 text-[11px] font-medium text-fg-3 uppercase',
  day: 'p-0 text-center',
  day_button: 'h-9 w-9 rounded-md text-[13px] tabular hover:bg-hover outline-none focus-visible:ring-2 focus-visible:ring-accent',
  today: '[&>button]:font-semibold [&>button]:text-accent-text',
  selected: '[&>button]:!bg-accent [&>button]:!text-white',
  outside: '[&>button]:text-fg-3 [&>button]:opacity-60',
  disabled: 'opacity-30',
}

function Calendar({ value, onPick }: { value: string | null | undefined; onPick: (iso: string) => void }) {
  const selected = parse(value) ?? undefined
  const [month, setMonth] = useState<Date>(selected ?? new Date())
  return (
    <DayPicker
      mode="single"
      locale={ru}
      weekStartsOn={1}
      showOutsideDays
      selected={selected}
      month={month}
      onMonthChange={setMonth}
      onSelect={(d) => d && onPick(ymd(d))}
      classNames={dayPickerClasses}
      components={{ Chevron: ({ orientation }) => (orientation === 'left' ? <ChevronLeft size={16} /> : <ChevronRight size={16} />) }}
    />
  )
}

export function DatePicker({ value, onChange, placeholder = 'дд.мм.гггг', clearable = true, className, autoFocus }: { value: string | null | undefined; onChange: (iso: string | null) => void; placeholder?: string; clearable?: boolean; className?: string; autoFocus?: boolean }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(isoToText(value))
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => setText(isoToText(value)), [value])

  const commit = () => {
    if (!text) return clearable ? onChange(null) : setText(isoToText(value))
    const iso = textToIso(text)
    if (iso) onChange(iso)
    else setText(isoToText(value))
  }
  const pick = (iso: string | null) => {
    onChange(iso)
    setText(isoToText(iso))
    setOpen(false)
  }

  return (
    <PopoverPanel
      open={open}
      onOpenChange={setOpen}
      keepFocus
      ignoreRef={wrap}
      anchor={
        <div ref={wrap} className={clsx('relative', className)}>
          <input
            value={text}
            inputMode="numeric"
            placeholder={placeholder}
            autoFocus={autoFocus}
            onChange={(e) => {
              const t = maskDate(e.target.value)
              setText(t)
              const iso = textToIso(t)
              if (iso) {
                onChange(iso)
                setOpen(false)
              }
            }}
            onClick={() => setOpen(true)}
            onBlur={(e) => {
              commit()
              if (!intoPopover(e)) setOpen(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commit()
                setOpen(false)
              }
              if (e.key === 'ArrowDown') setOpen(true)
            }}
            className={clsx(controlCls, 'h-9 pr-9 pl-3 tabular')}
          />
          <button type="button" tabIndex={-1} aria-label="Открыть календарь" onClick={() => setOpen((o) => !o)} className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-fg-3 hover:text-fg">
            <CalendarDays size={14} />
          </button>
        </div>
      }
    >
      <Calendar key={value ?? 'none'} value={value} onPick={pick} />
      <div className="flex items-center gap-1 border-t border-line p-2">
        <QuickBtn onClick={() => pick(todayStr())}>Сегодня</QuickBtn>
        <QuickBtn onClick={() => pick(ymd(addDays(new Date(), 1)))}>Завтра</QuickBtn>
        <QuickBtn onClick={() => pick(ymd(addDays(new Date(), 7)))}>Через неделю</QuickBtn>
        {clearable && value && (
          <QuickBtn onClick={() => pick(null)} className="ml-auto text-fg-3">
            Очистить
          </QuickBtn>
        )}
      </div>
    </PopoverPanel>
  )
}

function QuickBtn({ children, onClick, className }: { children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={clsx('h-7 rounded-md px-2 text-xs font-medium text-fg-2 hover:bg-hover hover:text-fg', className)}>
      {children}
    </button>
  )
}

function maskTime(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 4)
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d
}
const validTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)
const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`)

export function TimePicker({ value, onChange, placeholder = 'чч:мм', className }: { value: string | null | undefined; onChange: (t: string | null) => void; placeholder?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(value ?? '')
  const wrap = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => setText(value ?? ''), [value])
  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => {
      const target = value || format(new Date(), 'HH:00')
      list.current?.querySelector<HTMLElement>(`[data-time="${TIMES.find((t) => t >= target) ?? '23:45'}"]`)?.scrollIntoView({ block: 'center' })
    })
  }, [open, value])

  const commit = () => {
    if (!text) return onChange(null)
    const t = text.length <= 2 ? `${text.padStart(2, '0')}:00` : text
    if (validTime(t)) onChange(t)
    else setText(value ?? '')
  }

  return (
    <PopoverPanel
      open={open}
      onOpenChange={setOpen}
      keepFocus
      ignoreRef={wrap}
      matchWidth
      className="min-w-32"
      anchor={
        <div ref={wrap} className={clsx('relative', className)}>
          <input
            value={text}
            inputMode="numeric"
            placeholder={placeholder}
            onChange={(e) => {
              const t = maskTime(e.target.value)
              setText(t)
              if (validTime(t)) {
                onChange(t)
                setOpen(false)
              }
            }}
            onClick={() => setOpen(true)}
            onBlur={(e) => {
              commit()
              if (!intoPopover(e)) setOpen(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commit()
                setOpen(false)
              }
            }}
            className={clsx(controlCls, 'h-9 pr-9 pl-3 tabular')}
          />
          {value ? (
            <button type="button" tabIndex={-1} aria-label="Очистить время" onClick={() => onChange(null)} className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-fg-3 hover:text-fg">
              <X size={13} />
            </button>
          ) : (
            <Clock size={14} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-fg-3" />
          )}
        </div>
      }
    >
      <div ref={list} className="max-h-60 overflow-y-auto overscroll-contain p-1">
        {TIMES.map((t) => (
          <button
            key={t}
            type="button"
            data-time={t}
            onClick={() => {
              onChange(t)
              setOpen(false)
            }}
            className={clsx('flex h-8 w-full items-center rounded-md px-2.5 text-[13px] tabular hover:bg-hover', t === value && 'bg-accent-soft font-medium text-accent-text')}
          >
            {t}
          </button>
        ))}
      </div>
    </PopoverPanel>
  )
}

export function DateTimePicker({ value, onChange, dateOnly }: { value: string | null | undefined; onChange: (v: string | null) => void; dateOnly?: boolean }) {
  const date = value?.slice(0, 10) || null
  const time = value?.slice(11, 16) || null
  return (
    <div className="flex gap-2">
      <DatePicker value={date} clearable={false} onChange={(d) => onChange(d ? `${d}T${time || '09:00'}` : null)} className="flex-1" />
      {!dateOnly && <TimePicker value={time} onChange={(t) => date && onChange(`${date}T${t || '00:00'}`)} className="w-28 shrink-0" />}
    </div>
  )
}

const NBSP = ' '

function groupInt(s: string) {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
}

function numberToText(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return ''
  const [i, f] = String(Math.abs(v)).split('.')
  return (v < 0 ? '−' : '') + groupInt(i) + (f ? `,${f}` : '')
}

export function NumberInput({
  value,
  onChange,
  suffix,
  placeholder,
  allowNegative = true,
  decimals = 6,
  className,
  autoFocus,
}: {
  value: number | null | undefined
  onChange: (v: number | null) => void
  suffix?: string
  placeholder?: string
  allowNegative?: boolean
  decimals?: number
  className?: string
  autoFocus?: boolean
}) {
  const [text, setText] = useState(numberToText(value))
  const ref = useRef<HTMLInputElement>(null)
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(numberToText(value))
  }, [value])

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const caret = e.target.selectionStart ?? raw.length
    const sig = (s: string) => s.replace(/[^\d,.\-−]/g, '').length
    const before = sig(raw.slice(0, caret))

    const negative = allowNegative && /^[\s]*[-−]/.test(raw)
    let body = raw.replace(/[^\d,.]/g, '').replace(/\./g, ',')
    const comma = body.indexOf(',')
    if (comma >= 0) body = body.slice(0, comma + 1) + body.slice(comma + 1).replace(/,/g, '').slice(0, decimals)
    const [intPart, frac] = body.split(',')
    const int = intPart.replace(/^0+(?=\d)/, '')
    const next = (negative ? '−' : '') + groupInt(int) + (comma >= 0 ? `,${frac ?? ''}` : '')
    setText(next)

    const n = Number(`${negative ? '-' : ''}${int || (frac ? '0' : '')}${frac ? `.${frac}` : ''}`)
    onChange(int === '' && !frac ? null : Number.isFinite(n) ? n : null)

    requestAnimationFrame(() => {
      if (!ref.current) return
      let pos = 0
      let count = 0
      while (pos < next.length && count < before) {
        if (/[\d,−]/.test(next[pos])) count++
        pos++
      }
      ref.current.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className={clsx('relative', className)}>
      <input
        ref={ref}
        value={text}
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder={placeholder}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false
          setText(numberToText(value))
        }}
        onChange={handle}
        className={clsx(controlCls, 'h-9 px-3 tabular', suffix && 'pr-11')}
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-fg-3">{suffix}</span>}
    </div>
  )
}

function formatPhone(raw: string) {
  let d = raw.replace(/\D/g, '')
  if (!d) return raw.trim().startsWith('+') ? '+' : ''
  if (d[0] === '8' && !raw.trim().startsWith('+')) d = '7' + d.slice(1)
  if (d[0] === '7') {
    d = d.slice(0, 11)
    const p = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)]
    let out = '+7'
    if (p[0]) out += ` (${p[0]}`
    if (p[0].length === 3 && p[1]) out += `) ${p[1]}`
    if (p[2]) out += `-${p[2]}`
    if (p[3]) out += `-${p[3]}`
    return out
  }
  return '+' + d.slice(0, 15)
}

export function PhoneInput({ value, onChange, className }: { value: string | null | undefined; onChange: (v: string | null) => void; className?: string }) {
  return (
    <Input
      type="tel"
      inputMode="tel"
      value={value ?? ''}
      placeholder="+7 (900) 000-00-00"
      className={className}
      onChange={(e) => {
        const raw = e.target.value
        const prev = value ?? ''
        const sameDigits = raw.replace(/\D/g, '') === prev.replace(/\D/g, '')
        const next = raw.length < prev.length && sameDigits ? formatPhone(prev.replace(/\D/g, '').slice(0, -1)) : formatPhone(raw)
        onChange(next || null)
      }}
    />
  )
}

export function TelegramInput({ value, onChange, className }: { value: string | null | undefined; onChange: (v: string | null) => void; className?: string }) {
  return (
    <Input
      value={value ?? ''}
      placeholder="@username"
      className={className}
      onChange={(e) => {
        const name = e.target.value.trim().replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '').replace(/^@+/, '').replace(/[^\w]/g, '')
        onChange(name ? `@${name}` : null)
      }}
    />
  )
}

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode }) {
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

export function FieldLabel({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      <span className="text-[12.5px] font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-fg-3">{hint}</span>}
    </div>
  )
}
