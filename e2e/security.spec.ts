import { expect, test, type Page } from '@playwright/test'
import { codeAt, currentStep } from '../server/src/lib/totp.ts'
import { USER } from './helpers'

/** Код для секрета на следующий шаг: текущий мог уже быть использован при настройке, а сервер принимает ±1 шаг. */
let offset = 0
const nextCode = (secret: string) => codeAt(secret, currentStep() + offset++)

const secretOn = async (page: Page) => (await page.locator('[role=dialog] code, form code').first().innerText()).replace(/\s/g, '')

test('user turns on 2FA and then needs a code to sign in', async ({ page }) => {
  offset = 0
  await page.goto('/')
  await page.getByLabel('Логин').fill('e2e-2fa')
  await page.getByLabel('Пароль', { exact: true }).fill(USER.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('link', { name: 'Задачи' }).first()).toBeVisible()

  await page.goto('/settings#security')
  await page.locator('#security').getByRole('button', { name: 'Включить' }).click()
  await expect(page.getByRole('img', { name: 'QR-код для приложения-аутентификатора' })).toBeVisible()
  const secret = await secretOn(page)
  await page.getByLabel('Код из приложения').fill(nextCode(secret))
  await page.getByRole('button', { name: 'Подтвердить' }).click()

  const dialog = page.getByRole('dialog', { name: 'Коды восстановления' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(/^[a-z2-7]{4}-[a-z2-7]{4}$/)).toHaveCount(10)
  await dialog.getByRole('button', { name: 'Я сохранил коды' }).click()
  await expect(page.getByText('Включена', { exact: true })).toBeVisible()

  await page.context().clearCookies()
  await page.goto('/')
  await page.getByLabel('Логин').fill('e2e-2fa')
  await page.getByLabel('Пароль', { exact: true }).fill(USER.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('heading', { name: 'Код подтверждения' })).toBeVisible()
  await page.getByLabel('Код').fill('000000')
  await page.getByRole('button', { name: 'Подтвердить' }).click()
  await expect(page.getByText('Неверный код')).toBeVisible()
  await page.getByLabel('Код').fill(nextCode(secret))
  await page.getByRole('button', { name: 'Подтвердить' }).click()
  await expect(page.getByRole('link', { name: 'Задачи' }).first()).toBeVisible()
})

test('admin links an authenticator on first sign-in', async ({ page }) => {
  offset = 0
  await page.goto('/admin/')
  await page.getByLabel('Логин').fill('owner')
  await page.getByLabel('Пароль').fill('owner-password')
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page.getByRole('heading', { name: 'Привяжите приложение' })).toBeVisible()
  const secret = await secretOn(page)
  await page.getByLabel('Код').fill(nextCode(secret))
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('heading', { name: 'Обзор' })).toBeVisible()
})
