export function decodeText(buf: Buffer) {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    text = new TextDecoder('windows-1251').decode(buf)
  }
  return text.replace(/^﻿/, '')
}

export function readCsv(text: string): string[][] {
  // Разделитель — тот, что чаще всего встречается в одной строке среди первых: у выписок бывает «шапка» без колонок.
  const sample = text.split(/\r?\n/, 20)
  const widest = (d: string) => Math.max(...sample.map((l) => l.split(d).length))
  const delim = [';', ',', '\t'].reduce((best, d) => (widest(d) > widest(best) ? d : best), ';')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delim) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((c) => c.trim())) rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim())) rows.push(row)
  return rows.map((r) => r.map((c) => c.trim()))
}

interface PdfItem {
  x: number
  end: number
  str: string
}

export async function pdfLines(buf: Buffer): Promise<string[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: new Uint8Array(buf), useSystemFonts: false, verbosity: 0 })
  const doc = await task.promise
  const lines: string[] = []
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const { items } = await page.getTextContent()
      const rows: { y: number; items: PdfItem[] }[] = []
      for (const it of items) {
        if (!('str' in it) || !it.str.trim()) continue
        const x = it.transform[4]
        const y = it.transform[5]
        let row = rows.find((r) => Math.abs(r.y - y) < 2.5)
        if (!row) rows.push((row = { y, items: [] }))
        row.items.push({ x, end: x + it.width, str: it.str })
      }
      rows.sort((a, b) => b.y - a.y)
      for (const r of rows) {
        r.items.sort((a, b) => a.x - b.x)
        let line = ''
        let end: number | null = null
        for (const it of r.items) {
          if (end != null && it.x - end > 1) line += ' '
          line += it.str
          end = it.end
        }
        lines.push(line.replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim())
      }
    }
  } finally {
    await task.destroy()
  }
  return lines
}

export function parseAmount(s: unknown): number | null {
  const clean = String(s)
    .replace(/[\s  ]/g, '')
    .replace('−', '-')
    .replace(',', '.')
  const n = Number(clean)
  return Number.isFinite(n) ? n : null
}

export function ruDate(s: unknown): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(String(s).trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}
