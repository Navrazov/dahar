const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => entities[c])
