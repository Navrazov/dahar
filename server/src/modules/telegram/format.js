export const fmtMoney = (n, cur = '₽') => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n)} ${cur}`

export const fmtDay = (d) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))
