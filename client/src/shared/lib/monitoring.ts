type Sentry = typeof import('@sentry/react')

let sentry: Sentry | null = null
let sent = 0

/** Безобидные сообщения браузера, которые не говорят об ошибке в приложении. */
const BENIGN = [/^ResizeObserver loop/, /^Script error\.?$/]

export function reportClientError(error: unknown, component?: string) {
  const err = error instanceof Error ? error : new Error(String(error))
  if (BENIGN.some((re) => re.test(err.message))) return
  sentry?.captureException(err)
  if (sent++ > 20) return
  fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({ message: err.message, stack: err.stack, url: location.pathname, component }),
  }).catch(() => {})
}

export function initMonitoring() {
  window.addEventListener('error', (e) => reportClientError(e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => reportClientError(e.reason))
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
  if (!dsn) return
  import('@sentry/react').then((s) => {
    s.init({ dsn, environment: import.meta.env.MODE })
    sentry = s
  })
}
