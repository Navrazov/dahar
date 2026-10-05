import { defineConfig, devices } from '@playwright/test'

const PORT = 3199
const DATABASE_URL = process.env.E2E_DATABASE_URL || 'postgres://localhost:5432/dahar_e2e_test'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    // Фронтенды должны быть собраны: npm run build (скрипт test:e2e делает это сам).
    command: 'node e2e/prepare.ts && node server/src/index.ts',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { PORT: String(PORT), DATABASE_URL, DEFAULT_TZ: 'Europe/Moscow', TELEGRAM_BOT_TOKEN: '' },
  },
})
