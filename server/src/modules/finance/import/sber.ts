import { parseAmount, ruDate } from './read.ts'
import type { ParsedRow } from './types.ts'

const NUM = String.raw`\d{1,3}(?: \d{3})*,\d{2}`
const HEAD = new RegExp(String.raw`^(\d{2}\.\d{2}\.\d{4}) (\d{2}:\d{2}) (.+?) ([+−-]?${NUM})(?: (${NUM}))?$`)
const DETAIL = /^\d{2}\.\d{2}\.\d{4}(?: \d{3,8})?(?: (.*))?$/
const NOISE =
  /продолжение на следующей|страница \d|^дата операции|дата обработки|^категория|сумма в валюте|остаток (средств|на)|^выписка|сбербанк|^итого|расшифровка|^всего (списаний|пополнений)|^для проверки|^в валюте счёта|^\d+ из \d+$|реквизиты|^¹/i

export const isSberText = (lines: string[]) => lines.some((l) => HEAD.test(l)) && lines.some((l) => /сбер/i.test(l))

export function parseSber(lines: string[]): ParsedRow[] {
  const currency = lines.map((line) => /валюта[^:]*:\s*(RUB|USD|EUR|руб[^ ]*|доллар[^ ]*|евро)/i.exec(line)?.[1]).find(Boolean) || ''
  const out: ParsedRow[] = []
  let cur: ParsedRow | null = null
  let extra = 0
  for (const line of lines) {
    const head = HEAD.exec(line)
    if (head) {
      const raw = head[4]
      const amount = parseAmount(raw.replace('+', ''))
      if (!amount) {
        cur = null
        continue
      }
      cur = {
        date: ruDate(head[1]) ?? '',
        time: head[2],
        kind: raw.startsWith('+') ? 'income' : 'expense',
        amount: Math.abs(amount),
        currency,
        description: '',
        bank_category: head[3].trim(),
        mcc: '',
      }
      extra = 0
      out.push(cur)
      continue
    }
    if (!cur || NOISE.test(line)) {
      if (cur && NOISE.test(line)) extra = 99
      continue
    }
    const detail = !cur.description && extra === 0 ? DETAIL.exec(line) : null
    if (detail) {
      cur.description = detail[1] || ''
      continue
    }
    if (extra < 3) {
      cur.description = `${cur.description} ${line}`.trim()
      extra++
    }
  }
  for (const r of out) {
    r.description = r.description
      .replace(/\.?\s*Операция по (карте|счёту|счету) \*+\d+\.?/i, '')
      .replace(/\s+/g, ' ')
      .trim()
  }
  return out
}
