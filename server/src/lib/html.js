const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }

export const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => entities[c])
