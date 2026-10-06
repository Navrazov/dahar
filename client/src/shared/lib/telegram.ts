/** Минимум из Telegram WebApp API, который нужен мини-приложению. https://core.telegram.org/bots/webapps */
interface TelegramWebApp {
  initData: string
  initDataUnsafe: { user?: { id: number; first_name?: string } }
  colorScheme: 'light' | 'dark'
  platform: string
  ready(): void
  expand(): void
  disableVerticalSwipes?(): void
  setHeaderColor?(color: string): void
  setBackgroundColor?(color: string): void
  setBottomBarColor?(color: string): void
  openLink(url: string): void
  close(): void
  onEvent(event: 'themeChanged', cb: () => void): void
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void }
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
    notificationOccurred(type: 'error' | 'success' | 'warning'): void
    selectionChanged(): void
  }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

export const webApp = (): TelegramWebApp | null => {
  const app = window.Telegram?.WebApp
  return app && app.initData ? app : null
}

/** Вибрация на действиях — в Telegram это ощущается как отклик нативного приложения. */
export const haptic = {
  tap: () => webApp()?.HapticFeedback?.impactOccurred('light'),
  select: () => webApp()?.HapticFeedback?.selectionChanged(),
  success: () => webApp()?.HapticFeedback?.notificationOccurred('success'),
  error: () => webApp()?.HapticFeedback?.notificationOccurred('error'),
}

/** Тема мини-приложения следует за Telegram, цвета шапки — под фон Dahar. */
export function syncTelegramTheme() {
  const app = webApp()
  const apply = () => {
    const scheme = app?.colorScheme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    document.documentElement.dataset.theme = scheme
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    if (bg && app) {
      app.setHeaderColor?.(bg)
      app.setBackgroundColor?.(bg)
      app.setBottomBarColor?.(bg)
    }
  }
  apply()
  app?.onEvent('themeChanged', apply)
}
