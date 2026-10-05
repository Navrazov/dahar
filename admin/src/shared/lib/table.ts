import { useEffect, useState } from 'react'

export function tableOffset(value: string | null) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(1_000_000, Math.max(0, Math.floor(n))) : 0
}

export function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function exportCsv(name: string, rows: unknown[][]) {
  const cell = (value: unknown) => {
    const text = String(value ?? '')
    return '"' + (/^(\s*[=+\-@]|[\t\r\n])/.test(text) ? "'" + text : text).replaceAll('"', '""') + '"'
  }
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map((row) => row.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
