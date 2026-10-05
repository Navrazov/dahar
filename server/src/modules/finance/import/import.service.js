import { createHash } from 'node:crypto'
import { encode } from '../../../db/codec.js'
import { tx } from '../../../db/pool.js'
import { badRequest } from '../../../lib/errors.js'
import { addDays, isDate } from '../../../lib/time.js'
import { insertRow, patchRow } from '../../records/records.repository.js'
import { isTransferLike, knownCategories, merchantKey, suggestCategory } from './categories.js'
import {
  categoryNames, existingKeys, findAccount, loadRules, lockCandidate, saveKey, saveRule, transferCandidates,
} from './import.repository.js'
import { decodeText, pdfLines, readCsv } from './read.js'
import { isSberText, parseSber } from './sber.js'
import { isTbankCsv, parseTbank } from './tbank.js'

const MAX_BYTES = 10 * 1024 * 1024
const UNKNOWN = 'Не удалось распознать выписку. Сейчас поддерживаются Т-Банк (CSV) и Сбер (PDF)'

export async function parseStatement(buf) {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') {
    let lines
    try {
      lines = await pdfLines(buf)
    } catch {
      throw badRequest('Не удалось прочитать PDF')
    }
    if (isSberText(lines)) return { bank: 'sber', rows: parseSber(lines) }
    if (lines.some((l) => /т-?банк|тинькофф/i.test(l))) throw badRequest('Для Т-Банка загрузите выписку в формате CSV: в приложении «Выписка» → формат CSV')
    throw badRequest(UNKNOWN)
  }
  const rows = readCsv(decodeText(buf))
  if (isTbankCsv(rows)) return { bank: 'tbank', rows: parseTbank(rows) }
  throw badRequest(UNKNOWN)
}

function withKeys(accountId, rows) {
  const seen = new Map()
  return rows.map((r) => {
    const base = [accountId, r.date, r.time, r.kind, r.amount.toFixed(2), r.description.toLowerCase().replace(/\s+/g, ' ')].join('|')
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return { ...r, key: createHash('sha256').update(`${base}#${n}`).digest('hex').slice(0, 32) }
  })
}

const dayDiff = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000

async function requireAccount(userId, accountId, client) {
  const account = Number.isInteger(accountId) ? await findAccount(userId, accountId, client) : null
  if (!account) throw badRequest('Выберите счёт, к которому относится выписка')
  return account
}

export async function previewImport(userId, body) {
  const account = await requireAccount(userId, body?.account_id)
  if (typeof body?.data !== 'string' || !body.data) throw badRequest('Файл не передан')
  const buf = Buffer.from(body.data.replace(/^data:[^,]*,/, ''), 'base64')
  if (!buf.length) throw badRequest('Файл пустой')
  if (buf.length > MAX_BYTES) throw badRequest('Файл больше 10 МБ')

  const { bank, rows: parsed } = await parseStatement(buf)
  if (!parsed.length) throw badRequest('В файле не нашлось ни одной операции')

  const rows = withKeys(account.id, parsed).sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
  const [dupes, rules, names] = await Promise.all([existingKeys(userId, rows.map((r) => r.key)), loadRules(userId), categoryNames(userId)])
  const known = knownCategories(names)

  const dates = rows.map((r) => r.date).sort()
  const candidates = (await transferCandidates(userId, account.id, addDays(dates[0], -2), addDays(dates.at(-1), 2))).filter(isTransferLike)
  const used = new Set()

  return {
    bank,
    account_id: account.id,
    rows: rows.map((r) => {
      const duplicate = dupes.has(r.key)
      let match = null
      if (!duplicate && isTransferLike(r)) {
        const m = candidates.find((c) => !used.has(c.id) && c.kind !== r.kind && Math.abs(c.amount - r.amount) < 0.005 && dayDiff(c.date, r.date) <= 2)
        if (m) {
          used.add(m.id)
          match = { id: m.id, account_id: m.account_id, account_name: m.account_name }
        }
      }
      return {
        key: r.key,
        date: r.date,
        time: r.time,
        kind: r.kind,
        amount: r.amount,
        description: r.description,
        bank_category: r.bank_category,
        category: suggestCategory(r, rules, known),
        duplicate,
        match,
      }
    }),
  }
}

function cleanRow(r) {
  const amount = Number(r?.amount)
  if (typeof r?.key !== 'string' || !/^[0-9a-f]{32}$/.test(r.key)) throw badRequest('Неверная строка выписки')
  if (!isDate(r.date)) throw badRequest('Неверная дата в выписке')
  if (!['income', 'expense'].includes(r.kind)) throw badRequest('Неверный тип операции')
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) throw badRequest('Неверная сумма в выписке')
  return {
    key: r.key,
    date: r.date,
    kind: r.kind,
    amount: Math.round(amount * 100) / 100,
    category: String(r.category ?? '').trim().slice(0, 100),
    note: String(r.description ?? '').trim().slice(0, 500),
    match_id: Number.isInteger(r.match_id) ? r.match_id : null,
    learn: r.learn === true,
  }
}

export async function commitImport(userId, body) {
  if (!Array.isArray(body?.rows) || !body.rows.length) throw badRequest('Нет операций для сохранения')
  if (body.rows.length > 5000) throw badRequest('Слишком много операций за раз')
  const rows = body.rows.map(cleanRow)

  return tx(async (c) => {
    const account = await requireAccount(userId, body.account_id, c)
    const result = { created: 0, transfers: 0, skipped: 0 }
    for (const r of rows) {
      if ((await existingKeys(userId, [r.key], c)).size) {
        result.skipped++
        continue
      }
      let id
      const pair = r.match_id ? await lockCandidate(userId, r.match_id, account.id, c) : null
      if (pair && pair.kind !== r.kind && Math.abs(pair.amount - r.amount) < 0.005) {
        const [from, to] = r.kind === 'expense' ? [account.id, pair.account_id] : [pair.account_id, account.id]
        await patchRow('transactions', pair.id, { kind: 'transfer', account_id: from, to_account_id: to, category: null }, userId, c)
        id = pair.id
        result.transfers++
      } else {
        const data = encode('transactions', { date: r.date, kind: r.kind, amount: r.amount, account_id: account.id, category: r.category || null, note: r.note || null })
        id = (await insertRow('transactions', data, userId, c)).id
        result.created++
      }
      await saveKey(userId, r.key, id, c)
      const merchant = merchantKey(r.note)
      if (r.learn && r.category && merchant) await saveRule(userId, r.kind, merchant, r.category, c)
    }
    return result
  })
}
