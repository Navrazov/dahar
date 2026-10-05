const env = process.env

export const config = {
  port: Number(env.PORT) || 3001,
  isProd: env.NODE_ENV === 'production',
  env: env.NODE_ENV || 'development',
  databaseUrl: env.DATABASE_URL || 'postgres://localhost:5432/dahar',
  databaseSsl: env.PGSSL === 'true',
  defaultTz: env.DEFAULT_TZ || 'Europe/Moscow',
  telegram: {
    token: env.TELEGRAM_BOT_TOKEN || null,
    username: env.TELEGRAM_BOT_USERNAME || null,
  },
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
  admin: {
    login: env.ADMIN_LOGIN || null,
    password: env.ADMIN_PASSWORD || null,
  },
}
