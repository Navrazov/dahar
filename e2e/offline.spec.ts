import { expect, test } from '@playwright/test'
import { editor, signIn, unique } from './helpers'

test('changes made offline are kept and sent when the connection returns', async ({ page, context }) => {
  await signIn(page)
  await page.goto('/tasks')
  await expect(page.getByRole('button', { name: 'Задача', exact: true })).toBeVisible()

  await context.setOffline(true)
  await expect(page.getByRole('status').filter({ hasText: 'Нет сети' })).toBeVisible()

  const title = unique('Офлайн-задача')
  await page.getByRole('button', { name: 'Задача', exact: true }).click()
  await editor(page).getByLabel('Название *').fill(title)
  await editor(page).getByRole('button', { name: 'Создать' }).click()
  await expect(editor(page)).toBeHidden()

  const row = page.locator('div.group', { hasText: title })
  await expect(row, 'the new task shows up right away').toBeVisible()
  await row.getByRole('checkbox', { name: 'Выполнить' }).click()
  await expect(page.getByRole('status')).toContainText('Изменений ждут отправки: 2')

  await context.setOffline(false)
  await expect(page.getByText('Синхронизировано изменений: 2')).toBeVisible()
  await expect(page.getByRole('status')).toBeHidden()

  // На сервере задача создана и выполнена: временный id из офлайна заменился настоящим.
  const tasks = await page.request.get('/api/tasks').then((r) => r.json())
  const saved = tasks.find((t: { title: string }) => t.title === title)
  expect(saved?.status).toBe('done')
  expect(saved?.id).toBeGreaterThan(0)
})

test('the app opens without a network from the saved cache', async ({ page, context }) => {
  await signIn(page)
  await page.goto('/tasks')
  await expect(page.getByRole('heading', { name: 'Задачи' })).toBeVisible()
  // Даём service worker'у установиться и кэшу — записаться в IndexedDB.
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15_000 }).catch(() => page.reload())
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15_000 })
  await page.waitForTimeout(2500)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Задачи' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Нет сети' })).toBeVisible()
  await context.setOffline(false)
})

test('a lost success response and two syncing tabs still create only one record', async ({ page, context }) => {
  await signIn(page)
  await page.goto('/tasks')
  await expect(page.getByRole('heading', { name: 'Задачи', exact: true })).toBeVisible()
  const second = await context.newPage()
  await second.goto('/tasks')
  await expect(second.getByRole('heading', { name: 'Задачи', exact: true })).toBeVisible()
  const title = unique('Lost response')
  let lost = false
  await page.route('**/api/tasks', async (route) => {
    if (!lost && route.request().method() === 'POST' && route.request().postDataJSON()?.title === title) {
      lost = true
      await route.fetch()
      await route.abort('failed')
    } else await route.continue()
  })
  await page.getByRole('button', { name: 'Задача', exact: true }).click()
  await editor(page).getByLabel('Название *').fill(title)
  await editor(page).getByRole('button', { name: 'Создать' }).click()
  await expect(editor(page)).toBeHidden()
  await Promise.all([page.evaluate(() => window.dispatchEvent(new Event('online'))), second.evaluate(() => window.dispatchEvent(new Event('online')))])
  await expect
    .poll(async () => {
      const tasks = await page.request.get('/api/tasks').then((r) => r.json())
      return tasks.filter((t: { title: string }) => t.title === title).length
    })
    .toBe(1)
  await expect(page.getByRole('status')).toBeHidden()
  await second.close()
})
