const env = process.env

/** web — только HTTP; worker — только бот и фоновые задачи; all — всё вместе (по умолчанию). */
export type Role = 'all' | 'web' | 'worker'
const role: Role = env.ROLE === 'web' || env.ROLE === 'worker' ? env.ROLE : 'all'

export const config = {
  role,
  registrationEnabled: env.REGISTRATION_ENABLED === 'true' && !!env.TERMS_URL && !!env.PRIVACY_URL,
  termsUrl: env.TERMS_URL || null,
  privacyUrl: env.PRIVACY_URL || null,
  port: Number(env.PORT) || 3001,
  isProd: env.NODE_ENV === 'production',
  env: env.NODE_ENV || 'development',
  databaseUrl: env.DATABASE_URL || 'postgres://localhost:5432/dahar',
  databaseSsl: env.PGSSL === 'true',
  defaultTz: env.DEFAULT_TZ || 'Europe/Moscow',
  /** Публичный адрес сервиса: нужен боту для кнопки мини-приложения. На Railway берётся сам. */
  publicUrl: (env.PUBLIC_URL || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : '')).replace(/\/+$/, '') || null,
  telegram: {
    token: env.TELEGRAM_BOT_TOKEN || null,
    username: env.TELEGRAM_BOT_USERNAME || null,
  },
  /** Расшифровка голосовых: любой OpenAI-совместимый /audio/transcriptions (OpenAI, Groq…). */
  stt: env.STT_API_KEY
    ? {
        apiKey: env.STT_API_KEY,
        baseUrl: (env.STT_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
        model: env.STT_MODEL || 'whisper-large-v3-turbo',
      }
    : null,
  s3: env.S3_BUCKET
    ? {
        bucket: env.S3_BUCKET,
        region: env.S3_REGION || 'auto',
        endpoint: env.S3_ENDPOINT || undefined,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      }
    : null,
  sentryDsn: env.SENTRY_DSN || null,
  anthropicApiKey: env.ANTHROPIC_API_KEY || null,
  vapid: {
    publicKey: env.VAPID_PUBLIC_KEY || null,
    privateKey: env.VAPID_PRIVATE_KEY || null,
    subject: env.VAPID_SUBJECT || 'mailto:admin@dahar.local',
  },
  admin: {
    login: env.ADMIN_LOGIN || null,
    password: env.ADMIN_PASSWORD || null,
  },
}
