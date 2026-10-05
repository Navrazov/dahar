import { expect, test } from '@playwright/test'
import { editor, pick, signIn, unique, USER } from './helpers'

test('wrong password shows an error, right one opens the app', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Логин').fill(USER.login)
  await page.getByLabel('Пароль', { exact: true }).fill('not-the-password')
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByText('Неверный логин или пароль')).toBeVisible()

  await page.getByLabel('Пароль', { exact: true }).fill(USER.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('link', { name: 'Задачи' }).first()).toBeVisible()
})

test.describe('signed in', () => {
  test.beforeEach(async ({ page }) => signIn(page))

  test('create a task and complete it', async ({ page }) => {
    const title = unique('Купить молоко')
    await page.goto('/tasks')
    await page.getByRole('button', { name: 'Задача', exact: true }).click()
    await editor(page).getByLabel('Название *').fill(title)
    await editor(page).getByRole('button', { name: 'Создать' }).click()
    await expect(editor(page)).toBeHidden()

    const row = page.locator('div.group', { hasText: title })
    await expect(row).toBeVisible()
    await row.getByRole('checkbox', { name: 'Выполнить' }).click()
    await expect(row, 'done tasks leave the open list').toBeHidden()

    await page.getByText('Выполненные', { exact: true }).click()
    await expect(row.getByRole('checkbox', { name: 'Вернуть в работу' })).toBeVisible()
  })

  test('the N key opens a new task from anywhere', async ({ page }) => {
    await page.goto('/goals')
    await page.keyboard.press('n')
    await expect(editor(page).getByRole('heading', { name: 'Новая задача' })).toBeVisible()
  })

  test('completing a repeating task schedules the next one', async ({ page }) => {
    const title = unique('Зарядка')
    await page.goto('/tasks')
    await page.getByRole('button', { name: 'Задача', exact: true }).click()
    await editor(page).getByLabel('Название *').fill(title)
    await pick(page, 'Повторять', 'Каждый день')
    await editor(page).getByRole('button', { name: 'Создать' }).click()
    await expect(editor(page)).toBeHidden()

    await page.locator('div.group', { hasText: title }).getByRole('checkbox', { name: 'Выполнить' }).click()
    await page.getByText('Все', { exact: true }).click()
    const rows = page.locator('div.group', { hasText: title })
    await expect(rows).toHaveCount(2)
    await expect(rows.getByRole('checkbox', { name: 'Выполнить' })).toHaveCount(1)
    await expect(rows.getByRole('checkbox', { name: 'Вернуть в работу' })).toHaveCount(1)
  })

  test('mark a habit for today', async ({ page }) => {
    const name = unique('Читать')
    await page.goto('/habits')
    await page.getByRole('button', { name: 'Привычка', exact: true }).first().click()
    await editor(page).getByLabel('Название *').fill(name)
    await editor(page).getByRole('button', { name: 'Создать' }).click()
    await expect(editor(page)).toBeHidden()

    const card = page.locator('section, [class*="card"], div').filter({ hasText: name }).last()
    const today = page.getByRole('button', { name: /: не выполнено$/ }).last()
    await expect(card).toBeVisible()
    await today.click()
    await expect(page.getByRole('button', { name: /: выполнено$/ }).first()).toBeVisible()
  })

  test('import a bank statement without duplicates', async ({ page }) => {
    const account = unique('Т-Банк карта')
    await page.goto('/finance')
    await page.getByRole('button', { name: 'Счёт', exact: true }).click()
    await editor(page).getByLabel('Название *').fill(account)
    await editor(page).getByRole('button', { name: 'Создать' }).click()
    await expect(editor(page)).toBeHidden()

    await page.getByRole('button', { name: 'Загрузить выписку' }).click()
    await pick(page, 'Счёт', account, page.getByRole('dialog', { name: 'Загрузить выписку' }))
    await page.locator('input[type=file]').setInputFiles('e2e/fixtures/tbank.csv')
    await page.getByRole('button', { name: 'Сохранить 2 операции' }).click()
    await expect(page.getByText(/Добавлено: 2 операции/)).toBeVisible()

    await page.getByRole('button', { name: 'Загрузить выписку' }).click()
    await pick(page, 'Счёт', account, page.getByRole('dialog', { name: 'Загрузить выписку' }))
    await page.locator('input[type=file]').setInputFiles('e2e/fixtures/tbank.csv')
    await expect(page.getByRole('button', { name: 'Нечего сохранять' })).toBeDisabled()
  })

  test('command palette finds records and runs actions', async ({ page }) => {
    const title = unique('Позвонить бухгалтеру')
    await page.goto('/tasks')
    await page.getByRole('button', { name: 'Задача', exact: true }).click()
    await editor(page).getByLabel('Название *').fill(title)
    await editor(page).getByRole('button', { name: 'Создать' }).click()
    await expect(editor(page)).toBeHidden()

    await page.goto('/')
    await page.keyboard.press('ControlOrMeta+k')
    const palette = page.getByRole('dialog', { name: 'Поиск и команды' })
    await expect(palette).toBeVisible()
    await palette.getByRole('combobox').fill('бухгалт')
    await palette.getByRole('option', { name: new RegExp(title) }).click()
    await expect(editor(page).getByLabel('Название *')).toHaveValue(title)
    await page.keyboard.press('Escape')
    await expect(editor(page)).toBeHidden()

    await page.keyboard.press('/')
    await palette.getByRole('combobox').fill('финансы')
    await palette.getByRole('option', { name: 'Финансы' }).click()
    await expect(page).toHaveURL(/\/finance$/)
  })
})
