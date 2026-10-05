import { expect, test } from '@playwright/test'
import { editor, signIn, unique } from './helpers'

test('guided first day creates a task and a habit and can be dismissed', async ({ page }) => {
  await signIn(page, 'e2e-onboarding')
  await expect(page.getByText('Начните с одного полезного дня')).toBeVisible()
  const title = unique('First task')
  await page.getByLabel('Первая задача').fill(title)
  await page.getByRole('button', { name: 'Добавить задачу', exact: true }).click()
  await expect(page.getByText('Задача готова.', { exact: false })).toBeVisible()
  await expect(page.locator('div.group', { hasText: title })).toHaveCount(1)
  await page.getByLabel('Первая привычка').fill('Читать 15 минут')
  await page.getByRole('button', { name: 'Добавить привычку', exact: true }).click()
  await expect(page.getByLabel('Первая привычка')).toBeHidden()
  await page.getByRole('button', { name: 'Начать день', exact: true }).click()
  await expect(page.getByText('Начните с одного полезного дня')).toBeHidden()
  await page.screenshot({ path: '/tmp/dahar-after-desktop.png', fullPage: true })
})
test('focus, bulk completion and undo work through the interface', async ({ page }) => {
  await signIn(page)
  const a = unique('Bulk first'),
    b = unique('Bulk second')
  for (const title of [a, b]) {
    await page.request.post('/api/tasks', { data: { title, status: 'todo' } })
  }
  await page.goto('/tasks')
  await page.locator('div.group', { hasText: a }).getByRole('button', { name: 'Главное на сегодня' }).click()
  await page.goto('/')
  await expect(page.locator('div.group', { hasText: a })).toBeVisible()
  await page.goto('/tasks')
  await page.getByRole('checkbox', { name: `Выбрать ${a}`, exact: true }).click()
  await page.getByRole('checkbox', { name: `Выбрать ${b}`, exact: true }).click()
  await page.getByRole('button', { name: 'Завершить', exact: true }).click()
  await expect(page.locator('div.group', { hasText: a })).toBeHidden()
  await expect(page.locator('div.group', { hasText: b })).toBeHidden()
  await page.getByRole('button', { name: 'Отменить', exact: true }).last().click()
  await expect(page.locator('div.group', { hasText: a })).toBeVisible()
  await expect(page.locator('div.group', { hasText: b })).toBeVisible()
})
test('calendar previews imports and exports ICS, and repeated import updates the same event', async ({ page }) => {
  await signIn(page)
  await page.goto('/calendar')
  const title = unique('Calendar meeting')
  const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:${title}@test\r\nSUMMARY:${title}\r\nDTSTART:20261005T090000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`
  for (let i = 0; i < 2; i++) {
    await page.locator('input[type=file]').setInputFiles({ name: 'calendar.ics', mimeType: 'text/calendar', buffer: Buffer.from(ics) })
    await expect(page.getByRole('dialog', { name: 'Импорт календаря' })).toContainText(title)
    await page.getByRole('button', { name: 'Импортировать 1 событий' }).click()
    await expect(page.getByRole('dialog', { name: 'Импорт календаря' })).toBeHidden()
  }
  const events = await page.request.get('/api/events').then((r) => r.json())
  expect(events.filter((e: any) => e.title === title)).toHaveLength(1)
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспорт ICS' }).click()
  expect((await downloading).suggestedFilename()).toBe('dahar-calendar.ics')
})
test('an offline validation error remains visible, can be repaired, and then saves its dependent edit', async ({ page, context }) => {
  await signIn(page)
  await page.goto('/tasks')
  await expect(page.getByRole('heading', { name: 'Задачи', exact: true })).toBeVisible()
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Задача', exact: true }).click()
  await editor(page).getByLabel('Название *').fill('x'.repeat(201))
  await editor(page).getByRole('button', { name: 'Создать' }).click()
  await expect(editor(page)).toBeHidden()
  await page
    .locator('div.group', { hasText: 'x'.repeat(201) })
    .getByRole('checkbox', { name: 'Выполнить', exact: true })
    .click()
  await context.setOffline(false)
  await page.getByRole('button', { name: /Не сохранено изменений: 1/ }).click()
  await page.getByRole('dialog', { name: 'Несохранённые изменения' }).getByRole('button', { name: 'Исправить', exact: true }).click()
  const title = unique('Repaired')
  await page.getByRole('dialog', { name: 'Исправить изменение' }).getByLabel('Название *').fill(title)
  await page.getByRole('button', { name: 'Повторить отправку' }).click()
  await expect(page.getByRole('button', { name: /Не сохранено изменений/ })).toBeHidden()
  await expect
    .poll(async () => {
      const tasks = await page.request.get('/api/tasks').then((r) => r.json())
      return tasks.find((t: any) => t.title === title)?.status
    })
    .toBe('done')
})
