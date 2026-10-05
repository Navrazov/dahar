import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { controlCls } from './fields'

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
    if (comma >= 0)
      body =
        body.slice(0, comma + 1) +
        body
          .slice(comma + 1)
          .replace(/,/g, '')
          .slice(0, decimals)
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
