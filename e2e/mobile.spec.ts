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
