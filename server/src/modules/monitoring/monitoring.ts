import { config } from '../../config.ts'
import { query } from '../../db/pool.ts'

type Sentry = typeof import('@sentry/node')

let sentry: Sentry | null = null

export async function initMonitoring() {
  if (!config.sentryDsn) return
  try {
    sentry = await import('@sentry/node')
    sentry.init({ dsn: config.sentryDsn, environment: config.env, tracesSampleRate: 0 })
    console.log('Sentry enabled')
  } catch (e) {
    console.error('Sentry init failed:', (e as Error).message)
  }
}

export const sentryEnabled = () => !!sentry

function persist(source: string, message: unknown, stack: unknown, context: Record<string, unknown> | null, userId: unknown) {
  query('INSERT INTO error_log (source, message, stack, context, user_id) VALUES ($1, $2, $3, $4, $5)', [
    source,
    String(message).slice(0, 1000),
    stack ? String(stack).slice(0, 8000) : null,
    context ? JSON.stringify(context) : null,
    typeof userId === 'number' ? userId : null,
  ]).catch(() => {})
}

export function reportError(err: unknown, context: Record<string, unknown> = {}) {
  const e = err as { message?: string; stack?: string } | null
  const message = e?.message ?? String(err)
  console.error(JSON.stringify({ level: 'error', time: new Date().toISOString(), message, stack: e?.stack, ...context }))
  sentry?.captureException(err, { extra: context })
  const { userId, ...rest } = context
  persist('server', message, e?.stack, rest, userId)
}

export interface ClientError {
  message?: unknown
  stack?: unknown
  url?: unknown
  component?: unknown
  agent?: unknown
  user?: { id: number; login: string } | null
}

export function reportClientError({ message, stack, url, component, agent, user }: ClientError) {
  const entry = {
    message: String(message ?? '').slice(0, 500),
    stack: String(stack ?? '').slice(0, 4000),
    url: String(url ?? '').slice(0, 300),
    component: String(component ?? '').slice(0, 2000),
    agent: String(agent ?? '').slice(0, 200),
  }
  console.error(JSON.stringify({ level: 'client_error', time: new Date().toISOString(), user: user?.login ?? null, ...entry }))
  sentry?.captureMessage(`client: ${entry.message.slice(0, 200)}`)
  persist('client', entry.message || 'Unknown client error', entry.stack, { url: entry.url, component: entry.component, agent: entry.agent }, user?.id)
}

export async function cleanupErrorLog(days = 30) {
  await query(`DELETE FROM error_log WHERE created_at < now() - make_interval(days => $1)`, [days])
}
