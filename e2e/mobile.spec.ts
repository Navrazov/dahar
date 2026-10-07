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
    ['Итоги недели', 'Итоги недели'],
  ]) {
    await page.getByRole('link', { name: new RegExp(label) }).click()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.getByRole('link', { name: '← Все разделы' }).click()
  }
  await page.getByRole('link', { name: /Все задачи/ }).click()
  await expect(page.getByRole('heading', { name: 'Задачи', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Задача с деталями', exact: true }).click()
  const title = unique('Mini App full task')
  await editor(page).getByLabel('Название *').fill(title)
  await editor(page).getByRole('button', { name: 'Создать', exact: true }).click()
  await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible()
  await page.getByRole('link', { name: '← Все разделы' }).click()
  await page.getByRole('link', { name: /Настройки/ }).click()
  await expect(page.getByRole('heading', { name: 'Настройки', exact: true })).toBeVisible()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать резервную копию' }).click()
  expect((await downloading).suggestedFilename()).toMatch(/^dahar-backup-.*\.json$/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: '/tmp/dahar-miniapp-settings.png', fullPage: true })
})

test('Mini App daily cycle: inbox, focus, editing, habit and a saved weekly review', async ({ page, context }) => {
  await signIn(page, 'e2e-launch-b')
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
  const nav = page.getByRole('navigation', { name: 'Разделы мини-приложения' })
  await nav.getByRole('button', { name: 'Задачи', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Задачи', exact: true })).toBeVisible()
  const title = unique('Главное из Mini App')
  await page.getByRole('textbox', { name: 'Название новой задачи' }).fill(title)
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()
  const row = page.getByTestId('mini-task').filter({ has: page.getByRole('button', { name: title, exact: true }) })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: title, exact: true }).click()
  await expect(editor(page)).toBeVisible()
  await expect(editor(page).getByRole('button', { name: 'Дополнительные настройки', exact: true })).toBeVisible()
  await editor(page).getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(row.getByRole('checkbox', { name: 'Выполнить' })).not.toBeChecked()
  await row.getByRole('button', { name: 'Главное на сегодня' }).click()
  await expect(row.getByRole('button', { name: 'Убрать из главного' })).toBeVisible()
  await nav.getByRole('button', { name: 'Сегодня', exact: true }).click()
  await expect(row).toBeVisible()
  await row.getByRole('checkbox', { name: 'Выполнить' }).click()
  await expect(page.getByText('Выполнено сегодня · 1', { exact: true })).toBeVisible()
  await page.getByText('Выполнено сегодня · 1', { exact: true }).click()
  await expect(row.getByRole('checkbox', { name: 'Вернуть в работу' })).toBeChecked()
  await context.setOffline(true)
  await expect(page.getByRole('alert')).toContainText('Нет сети')
  await expect(row.getByRole('checkbox', { name: 'Вернуть в работу' })).toBeDisabled()
  await context.setOffline(false)
  await expect(row.getByRole('checkbox', { name: 'Вернуть в работу' })).toBeEnabled()

  await nav.getByRole('button', { name: 'Привычки', exact: true }).click()
  const habit = unique('Читать в Mini App')
  await page.getByRole('textbox', { name: 'Название привычки' }).fill(habit)
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()
  const habitButton = page.getByRole('button', { name: new RegExp('^' + habit + ':') })
  await expect(habitButton).toBeVisible()
  await habitButton.click()
  await expect(page.getByText('Отмечено 1 из 1', { exact: true })).toBeVisible()
  await nav.getByRole('button', { name: 'Сегодня', exact: true }).click()
  await page.getByRole('link', { name: 'Итоги недели →', exact: true }).click()
  await page.getByRole('textbox', { name: 'Что получилось', exact: true }).fill('Сделал главное и отметил привычку')
  await page.getByRole('textbox', { name: 'Главное на следующую неделю', exact: true }).fill('Продолжить проект')
  await nav.getByRole('button', { name: 'Сегодня', exact: true }).click()
  await page.getByRole('link', { name: 'Итоги недели →', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Что получилось', exact: true })).toHaveValue('Сделал главное и отметил привычку')
  await page.getByRole('button', { name: 'Сохранить итоги', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Сохранить итоги', exact: true })).toBeDisabled()
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Главное на следующую неделю', exact: true })).toHaveValue('Продолжить проект')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('miniapp-week.png'), fullPage: true })
})

test('Mini App pages large lists on the server and searches beyond the first page', async ({ page, context }) => {
  await signIn(page, 'e2e-mini-pages')
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
  const requests: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/tasks') requests.push(request.url())
  })
  await page.goto('/tg')
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible()
  await page.getByRole('navigation', { name: 'Разделы мини-приложения' }).getByRole('button', { name: 'Задачи', exact: true }).click()
  await expect(page.getByText('65 задач · нажми на название, чтобы изменить', { exact: true })).toBeVisible()
  await expect(page.getByTestId('mini-task')).toHaveCount(50)
  await page.getByRole('button', { name: 'Показать ещё', exact: true }).click()
  await expect(page.getByTestId('mini-task')).toHaveCount(65)
  await expect(page.getByRole('button', { name: 'Показать ещё', exact: true })).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Поиск задач' }).fill('Paged Mini 1')
  await expect(page.getByTestId('mini-task')).toHaveCount(11)
  await expect(page.getByRole('button', { name: 'Paged Mini 1', exact: true })).toBeVisible()
  expect(requests).toEqual([])
})

test('Mini App keeps unstarred tasks today, assigns projects and supports touch swipe with undo', async ({ page, context }) => {
  await signIn(page, 'e2e-mini-gestures')
  const { user } = await page.request.get('/api/auth/me').then((r) => r.json())
  const token = (await context.cookies()).find((c) => c.name === 'sid')!.value
  const project = await page.request.post('/api/projects', { data: { name: unique('Mini project'), status: 'active' } }).then((r) => r.json())
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
  const nav = page.getByRole('navigation', { name: 'Разделы мини-приложения' })
  await nav.getByRole('button', { name: 'Задачи', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Задачи', exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Проект новой задачи' }).selectOption(String(project.id))
  const title = unique('Swipe task')
  await page.getByRole('textbox', { name: 'Название новой задачи' }).fill(title)
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()
  const row = page.getByTestId('mini-task').filter({ has: page.getByRole('button', { name: title, exact: true }) })
  await expect(row).toBeVisible()
  await expect(row.getByRole('combobox', { name: `Проект задачи ${title}` })).toHaveValue(String(project.id))
  const apiGet = () => page.request.get('/api/tasks', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())
  const original = (await apiGet()).find((t) => t.title === title)
  await row.getByRole('button', { name: 'Главное на сегодня', exact: true }).click()
  await expect(row.getByRole('button', { name: 'Убрать из главного', exact: true })).toBeVisible()
  await nav.getByRole('button', { name: 'Сегодня', exact: true }).click()
  await row.getByRole('button', { name: 'Убрать из главного', exact: true }).click()
  await expect(page.getByText('Другие дела сегодня', { exact: true })).toBeVisible()
  await expect(row).toBeVisible()
  await expect.poll(async () => (await apiGet()).find((t) => t.id === original.id)?.due_date).toBe(null)
  const cdp = await context.newCDPSession(page)
  const swipe = async (dx: number, dy = 0) => {
    const box = (await row.boundingBox())!,
      x = box.x + box.width - 24,
      y = box.y + 30
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let i = 1; i <= 12; i++)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 12, y: y + (dy * i) / 12 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  await swipe(0, 70)
  await expect(row).toBeVisible()
  await expect(editor(page)).toHaveCount(0)
  await swipe(-110)
  const action = page.getByRole('button', { name: `Удалить ${title}`, exact: true })
  await expect(action).toBeVisible()
  await action.click()
  await expect(row).toHaveCount(0)
  await page.getByRole('button', { name: 'Отменить', exact: true }).click()
  await expect(row).toBeVisible()
  await expect.poll(async () => (await apiGet()).find((t) => t.title === title)?.id).toBe(original.id)
  await swipe(-290)
  await expect(row).toHaveCount(0)
  await page.getByRole('button', { name: 'Отменить', exact: true }).click()
  await expect(row).toBeVisible()
  await nav.getByRole('button', { name: 'Задачи', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Задачи', exact: true })).toBeVisible()
  const handle = page.getByRole('button', { name: `Перетащить ${title}`, exact: true }),
    box = (await handle.boundingBox())!
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width / 2 + 12, y: box.y + box.height / 2 }] })
  const target = page.locator('[data-drop-label="Завтра"]')
  await expect(target).toBeVisible()
  const destination = (await target.boundingBox())!
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: destination.x + destination.width / 2, y: destination.y + destination.height / 2 }],
  })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const today = await page.request
    .get('/api/mini/today', { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.json())
    .then((r) => r.date)
  const tomorrow = new Date(Date.parse(today + 'T00:00Z') + 86400000).toISOString().slice(0, 10)
  await expect.poll(async () => (await apiGet()).find((t) => t.id === original.id)?.due_date).toBe(tomorrow)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
