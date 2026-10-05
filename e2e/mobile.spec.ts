import { expect, test } from '@playwright/test'
import { editor, signIn, unique } from './helpers'

test('on a phone: menu, search and a new task from the header', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'Меню' }).click()
  await page.locator('aside').getByRole('link', { name: 'Задачи' }).click()
  await expect(page).toHaveURL(/\/tasks$/)

  const title = unique('С телефона')
  await page.getByRole('button', { name: 'Новая задача' }).click()
  await editor(page).getByLabel('Название *').fill(title)
  await editor(page).getByRole('button', { name: 'Создать' }).click()
  await expect(page.locator('div.group', { hasText: title })).toBeVisible()

  await page.getByRole('button', { name: 'Поиск' }).click()
  await expect(page.getByRole('dialog', { name: 'Поиск и команды' })).toBeVisible()
})

test('bottom navigation opens the calendar without the drawer', async ({ page }) => {
  await signIn(page)
  await page.getByRole('navigation', { name: 'Основные разделы' }).getByRole('link', { name: 'Календарь' }).click()
  await expect(page.getByRole('heading', { name: 'Календарь' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: '/tmp/dahar-after-mobile.png', fullPage: true })
})

test('mobile home is compact and task filters and selection open on demand', async ({ page }) => {
  await signIn(page)
  await expect(page.getByText('Показатели и проекты', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Итоги недели', exact: true }).last()).toBeHidden()
  await page.screenshot({ path: '/tmp/dahar-mobile-home.png', fullPage: true })
  await page.getByText('Показатели и проекты', { exact: true }).click()
  await expect(page.getByRole('link', { name: 'Итоги недели', exact: true }).last()).toBeVisible()
  await page.getByRole('navigation', { name: 'Основные разделы' }).getByRole('link', { name: 'Задачи', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Любой приоритет', exact: true })).toBeHidden()
  await page.getByRole('button', { name: 'Фильтры', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Любой приоритет', exact: true })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /^Выбрать / }).first()).toBeHidden()
  await page.getByRole('button', { name: 'Выбрать задачи', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: /^Выбрать / }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Новая задача', exact: true }).click()
  await expect(editor(page)).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('Mini App opens full sections, creates a task and exports data without cookies', async ({ page, context }) => {
  await signIn(page)
  const { user } = await page.request.get('/api/auth/me').then((r) => r.json())
  const token = (await context.cookies()).find((c) => c.name === 'sid')!.value
  await context.clearCookies()
  await page.route('https://telegram.org/**', (route) => route.abort())
  await page.route('**/api/telegram/webapp', (route) => route.fulfill({ json: { token, user } }))
  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        initData: 'test',
        initDataUnsafe: {},
        colorScheme: 'light',
        platform: 'android',
        ready() {},
        expand() {},
        onEvent() {},
        openLink() {},
        close() {},
      },
    }
  })
  await page.goto('/tg')
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible()
  await page.getByRole('navigation', { name: 'Разделы мини-приложения' }).getByRole('button', { name: 'Ещё' }).click()
  for (const name of ['Все задачи', 'Проекты', 'Цели', 'Календарь', 'Настройки']) {
    await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible()
  }
  await page.screenshot({ path: '/tmp/dahar-miniapp-more.png', fullPage: true })
  for (const [label, heading] of [
    ['Проекты', 'Проекты'],
    ['Цели', 'Цели'],
    ['Календарь', 'Календарь'],
    ['Все привычки', 'Привычки'],
    ['Финансы', 'Личные финансы'],
    ['Итоги недели', 'Обзор недели'],
  ]) {
    await page.getByRole('link', { name: new RegExp(label) }).click()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.getByRole('link', { name: '← Все разделы' }).click()
  }
  await page.getByRole('link', { name: /Все задачи/ }).click()
  await expect(page.getByRole('heading', { name: 'Задачи', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Действия', exact: true }).click()
  await page.getByRole('button', { name: 'Задача', exact: true }).click()
  const title = unique('Mini App full task')
  await editor(page).getByLabel('Название *').fill(title)
  await editor(page).getByRole('button', { name: 'Создать', exact: true }).click()
  await expect(page.locator('div.group', { hasText: title })).toBeVisible()
  await page.getByRole('link', { name: '← Все разделы' }).click()
  await page.getByRole('link', { name: /Настройки/ }).click()
  await expect(page.getByRole('heading', { name: 'Настройки', exact: true })).toBeVisible()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать резервную копию' }).click()
  expect((await downloading).suggestedFilename()).toMatch(/^dahar-backup-.*\.json$/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: '/tmp/dahar-miniapp-settings.png', fullPage: true })
})
