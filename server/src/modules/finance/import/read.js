export function decodeText(buf) {
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    text = new TextDecoder('windows-1251').decode(buf)
  }
  return text.replace(/^﻿/, '')
}

export function readCsv(text) {
  const firstLine = text.slice(0, text.indexOf('\n') + 1 || undefined)
  const delim = [';', ',', '\t'].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ';')
  const rows = []
  let row = []
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

export async function pdfLines(buf) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: new Uint8Array(buf), useSystemFonts: false, isEvalSupported: false, verbosity: 0 })
  const doc = await task.promise
  const lines = []
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const { items } = await page.getTextContent()
      const rows = []
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
        let end = null
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

export function parseAmount(s) {
  const clean = String(s).replace(/[\s  ]/g, '').replace('−', '-').replace(',', '.')
  const n = Number(clean)
  return Number.isFinite(n) ? n : null
}

export function ruDate(s) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(String(s).trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}
