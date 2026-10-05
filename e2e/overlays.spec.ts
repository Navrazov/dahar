import { expect, test } from '@playwright/test'
import { editor, signIn, unique } from './helpers'

test('opening the editor keeps its horizontal center throughout the animation', async ({ page }) => {
  await signIn(page)
  const samples = page.evaluate(async () => {
    const centers: number[] = []
    const end = performance.now() + 800
    while (performance.now() < end) {
      const dialog = document.querySelector('[role="dialog"]')
      if (dialog) {
        const rect = dialog.getBoundingClientRect()
        centers.push(rect.left + rect.width / 2)
      }
      await new Promise(requestAnimationFrame)
    }
    return centers
  })
  await page.keyboard.press('n')
  await expect(editor(page)).toBeVisible()
  const centers = await samples
  expect(centers.length).toBeGreaterThan(5)
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(2)
})

test('two notifications remain fully visible without overlapping', async ({ page }) => {
  await signIn(page)
  await page.keyboard.press('n')
  await editor(page).getByLabel('Название *').fill(unique('Toasts'))
  await editor(page).getByRole('button', { name: 'Создать', exact: true }).click()
  const toasts = page.locator('[data-sonner-toast][data-visible="true"]')
  await expect(toasts).toHaveCount(2)
  await expect
    .poll(async () => {
      const bounds = await toasts.evaluateAll((elements) =>
        elements
          .map((el) => {
            const r = el.getBoundingClientRect()
            return { top: r.top, bottom: r.bottom }
          })
          .sort((a, b) => a.top - b.top),
      )
      return bounds.length === 2 && bounds[0].bottom <= bounds[1].top
    })
    .toBe(true)
  await page.screenshot({ path: '/tmp/dahar-notifications.png' })
})
