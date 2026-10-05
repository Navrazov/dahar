// Тема до отрисовки React, чтобы не мигал светлый фон. Отдельным файлом — CSP запрещает inline-скрипты.
try {
  const t = localStorage.getItem('theme')
  if (t) document.documentElement.dataset.theme = t
} catch {}
