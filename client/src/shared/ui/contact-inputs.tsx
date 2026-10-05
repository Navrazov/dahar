import { Input } from './inputs'

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
        const name = e.target.value
          .trim()
          .replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '')
          .replace(/^@+/, '')
          .replace(/[^\w]/g, '')
        onChange(name ? `@${name}` : null)
      }}
    />
  )
}
