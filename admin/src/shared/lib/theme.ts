import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'
const EVENT = 'dahar:admin-theme'
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('dahar-admin-theme')
      return saved === 'light' || saved === 'dark' ? saved : 'system'
    } catch {
      return 'system'
    }
  })
  useEffect(() => {
    const changed = (event: Event) => {
      const next = (event as CustomEvent<Theme>).detail
      if (next === 'dark' || next === 'light' || next === 'system') setTheme(next)
    }
    window.addEventListener(EVENT, changed)
    return () => window.removeEventListener(EVENT, changed)
  }, [])
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('dahar-admin-theme', theme)
    } catch {}
  }, [theme])
  const change = (next: Theme) => {
    setTheme(next)
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }))
  }
  return [theme, change] as const
}
