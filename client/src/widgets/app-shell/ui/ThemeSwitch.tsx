import clsx from 'clsx'
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useTheme, type Theme } from '../model/theme'

const options: { v: Theme; icon: LucideIcon; label: string }[] = [
  { v: 'light', icon: Sun, label: 'Светлая тема' },
  { v: 'dark', icon: Moon, label: 'Тёмная тема' },
  { v: 'system', icon: Monitor, label: 'Как в системе' },
]

export function ThemeSwitch() {
  const [theme, setTheme] = useTheme()
  return (
    <div className="flex rounded-[8px] bg-surface-2 p-[3px]">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          title={o.label}
          aria-label={o.label}
          aria-pressed={theme === o.v}
          onClick={() => setTheme(o.v)}
          className={clsx(
            'flex h-7 flex-1 items-center justify-center rounded-[6px] transition-colors',
            theme === o.v ? 'bg-surface text-fg shadow-[0_1px_2px_rgb(0_0_0/0.07)]' : 'text-fg-3 hover:text-fg',
          )}
        >
          <o.icon size={14} />
        </button>
      ))}
    </div>
  )
}
