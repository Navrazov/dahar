import { useEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { DayPicker } from 'react-day-picker'
import { ru } from 'react-day-picker/locale'
import { addDays, format } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react'
import { PopoverPanel } from './overlay'
import { parse, todayStr, ymd } from '../lib/date'
import { controlCls } from './fields'

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

export function DatePicker({
  value,
  onChange,
  placeholder = 'дд.мм.гггг',
  clearable = true,
  className,
  autoFocus,
}: {
  value: string | null | undefined
  onChange: (iso: string | null) => void
  placeholder?: string
  clearable?: boolean
  className?: string
  autoFocus?: boolean
}) {
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
          <button
            type="button"
            tabIndex={-1}
            aria-label="Открыть календарь"
            onClick={() => setOpen((o) => !o)}
            className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-fg-3 hover:text-fg"
          >
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

export function TimePicker({
  value,
  onChange,
  placeholder = 'чч:мм',
  className,
}: {
  value: string | null | undefined
  onChange: (t: string | null) => void
  placeholder?: string
  className?: string
}) {
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
            <button
              type="button"
              tabIndex={-1}
              aria-label="Очистить время"
              onClick={() => onChange(null)}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-fg-3 hover:text-fg"
            >
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
            className={clsx(
              'flex h-8 w-full shrink-0 items-center rounded-md px-2.5 text-[13px] tabular transition-colors duration-100 hover:bg-hover',
              t === value && 'bg-accent-soft font-medium text-accent-text',
            )}
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
