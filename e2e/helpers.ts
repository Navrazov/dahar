import { expect, type Locator, type Page } from '@playwright/test'

export const USER = { login: 'e2e', password: 'e2e-password' }

export async function signIn(page: Page, login = USER.login) {
  await page.goto('/')
  await page.getByLabel('Логин').fill(login)
  await page.getByLabel('Пароль', { exact: true }).fill(USER.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('button', { name: /^(Меню|Поиск ⌘K|Поиск Ctrl K)$/ }).first()).toBeVisible()
}

/** Модальное окно редактора записи (поповеры выбора тоже имеют роль dialog, но без кнопок формы). */
export const editor = (page: Page) => page.getByRole('dialog').filter({ has: page.getByRole('button', { name: /^(Создать|Сохранить)$/ }) })

export async function pick(page: Page, label: string, option: string, scope: Locator = editor(page)) {
  await scope.getByLabel(label).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

let counter = 0
export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}${counter++}`
