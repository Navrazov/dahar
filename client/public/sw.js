const SHELL = 'shell-v5'
const ASSETS = 'assets-v4'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon-192.png', '/theme-init.js'])))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return
  // мини-приложение Telegram — отдельная страница, в кэш оболочки её класть нельзя
  if (url.pathname === '/tg' || url.pathname.startsWith('/tg/')) return

  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.open(ASSETS).then(async (c) => {
        const hit = await c.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) c.put(req, res.clone())
        return res
      }),
    )
    return
  }

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  // Остальная статика (иконки, манифест, theme-init.js): сначала сеть, без неё — кэш.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(() => caches.match(req).then((hit) => hit || Response.error())),
  )
})

// Push-уведомления: напоминания о задачах и утренняя сводка.
self.addEventListener('push', (e) => {
  let data = {}
  try {
    data = e.data ? e.data.json() : {}
  } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title || 'Dahar', {
      body: data.body || '',
      tag: data.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/', taskId: data.taskId },
      actions: data.taskId ? [{ action: 'done', title: '✓ Готово' }] : [],
    }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const { url = '/', taskId } = e.notification.data || {}
  if (e.action === 'done' && taskId) {
    e.waitUntil(
      fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      }).catch(() => {}),
    )
    return
  }
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((w) => new URL(w.url).origin === self.location.origin)
      if (open) return open.focus().then((w) => w.navigate(url))
      return self.clients.openWindow(url)
    }),
  )
})
