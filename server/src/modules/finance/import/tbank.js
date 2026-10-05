import { parseAmount, ruDate } from './read.js'

export const isTbankCsv = (rows) => {
  const head = (rows[0] || []).map((c) => c.toLowerCase())
  return head.includes('дата операции') && (head.includes('сумма платежа') || head.includes('сумма операции'))
}

export function parseTbank(rows) {
  const head = rows[0].map((c) => c.toLowerCase())
  const col = (name) => head.indexOf(name)
  const iDate = col('дата операции')
  const iStatus = col('статус')
  const iAmount = col('сумма платежа') >= 0 ? col('сумма платежа') : col('сумма операции')
  const iCategory = col('категория')
  const iDesc = col('описание')
  const iMcc = col('mcc')

  const out = []
  for (const r of rows.slice(1)) {
    if (iStatus >= 0 && r[iStatus] && r[iStatus].toUpperCase() !== 'OK') continue
    const date = ruDate(r[iDate])
    const amount = parseAmount(r[iAmount])
    if (!date || !amount) continue
    out.push({
      date,
      time: /\d{2}:\d{2}/.exec(r[iDate])?.[0] ?? '',
      kind: amount < 0 ? 'expense' : 'income',
      amount: Math.abs(amount),
      description: r[iDesc] || '',
      bank_category: iCategory >= 0 ? r[iCategory] || '' : '',
      mcc: iMcc >= 0 ? r[iMcc] || '' : '',
    })
  }
  return out
}
