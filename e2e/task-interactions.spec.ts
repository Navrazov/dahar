import { expect, test, type Locator, type Page } from '@playwright/test'
import { editor, signIn, unique } from './helpers'

async function drag(page: Page, handle: Locator, target: Locator) {
  await expect(handle).toBeVisible()
  await expect(handle).toBeEnabled()
  await handle.hover()
  const a = (await handle.boundingBox())!
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2, { steps: 3 })
  await expect(handle).toHaveAttribute('aria-pressed', 'true')
  await expect(target).toBeVisible()
  await target.scrollIntoViewIfNeeded()
  const b = (await target.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 })
  await page.mouse.up()
}

test('tasks reorder, move between days and projects, and accept keyboard dragging', async ({ page }) => {
  await signIn(page, 'e2e-interactions')
  const { date } = await page.request.get('/api/mini/today').then((r) => r.json())
  const project = await page.request.post('/api/projects', { data: { name: unique('DnD project'), status: 'active' } }).then((r) => r.json())
  const a = await page.request.post('/api/tasks', { data: { title: unique('DnD A'), due_date: date } }).then((r) => r.json())
  const b = await page.request.post('/api/tasks', { data: { title: unique('DnD B'), due_date: date } }).then((r) => r.json())
  await page.goto('/tasks')
  const handle = () => page.getByRole('button', { name: `Перетащить ${a.title}`, exact: true })
  await drag(page, handle(), page.locator(`[data-drop-label='Перед «${b.title}»']`))
  await expect
    .poll(async () => {
      const rows = await page.request.get('/api/mini/tasks?filter=today').then((r) => r.json())
      return rows.items.map((t) => t.id)
    })
    .toEqual([a.id, b.id])
  await page.reload()
  const rows = page.locator('[data-drop-label^="Перед «"]')
  await expect(rows.first()).toContainText(a.title)
  await drag(page, handle(), page.locator(`[data-drop-label='В проект «${project.name}»']`))
  await expect
    .poll(
      async () =>
        await page.request
          .get(`/api/tasks/${a.id}`)
          .then((r) => r.json())
          .then((t) => t.project_id),
    )
    .toBe(project.id)
  await handle().focus()
  await handle().press('Space')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  const tomorrow = new Date(Date.parse(date + 'T00:00Z') + 86400000).toISOString().slice(0, 10)
  await expect
    .poll(
      async () =>
        await page.request
          .get(`/api/tasks/${a.id}`)
          .then((r) => r.json())
          .then((t) => t.due_date),
    )
    .toBe(tomorrow)
  await page.getByRole('button', { name: 'Задача', exact: true }).click()
  await expect(editor(page).getByText('Проект', { exact: true })).toBeVisible()
  await editor(page).getByRole('button', { name: 'Отмена', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('calendar drags tasks across dates and events across dates and quarter-hour slots', async ({ page }) => {
  await signIn(page, 'e2e-interactions')
  const { date } = await page.request.get('/api/mini/today').then((r) => r.json()),
    next = (n: number) => new Date(Date.parse(date + 'T00:00Z') + 86400000 * n).toISOString().slice(0, 10)
  const task = await page.request.post('/api/tasks', { data: { title: unique('Calendar drag task'), due_date: date } }).then((r) => r.json())
  const event = await page.request
    .post('/api/events', { data: { title: unique('Calendar drag event'), start: date + 'T09:00', end: date + 'T11:30' } })
    .then((r) => r.json())
  await page.goto('/calendar')
  await page.getByRole('button', { name: 'Месяц', exact: true }).click()
  await drag(page, page.getByRole('button', { name: `Перетащить ${task.title}`, exact: true }), page.locator(`[data-drop-label='На ${next(1)}']`))
  await expect
    .poll(
      async () =>
        await page.request
          .get(`/api/tasks/${task.id}`)
          .then((r) => r.json())
          .then((t) => t.due_date),
    )
    .toBe(next(1))
  await drag(page, page.getByRole('button', { name: `Перетащить ${event.title}`, exact: true }), page.locator(`[data-drop-label='На ${next(1)}']`))
  await expect
    .poll(
      async () =>
        await page.request
          .get(`/api/events/${event.id}`)
          .then((r) => r.json())
          .then((e) => [e.start, e.end]),
    )
    .toEqual([next(1) + 'T09:00', next(1) + 'T11:30'])
  await page.getByRole('button', { name: 'Неделя', exact: true }).click()
  await drag(page, page.getByRole('button', { name: `Перетащить ${event.title}`, exact: true }), page.locator(`[data-drop-label='${next(2)}, 10:15']`).first())
  await expect
    .poll(
      async () =>
        await page.request
          .get(`/api/events/${event.id}`)
          .then((r) => r.json())
          .then((e) => [e.start, e.end]),
    )
    .toEqual([next(2) + 'T10:15', next(2) + 'T12:45'])
  await page.reload()
  await expect(page.getByRole('button', { name: `Перетащить ${event.title}`, exact: true })).toBeVisible()
})
