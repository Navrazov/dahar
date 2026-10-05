import { startAction } from '../../history/operation.ts'
import { createHash } from 'node:crypto'
import type { PoolClient } from 'pg'
import { encode } from '../../../db/codec.ts'
import { tx } from '../../../db/pool.ts'
import { badRequest } from '../../../lib/errors.ts'
import { addDays, isDate } from '../../../lib/time.ts'
import { insertRow, patchRow } from '../../records/records.repository.ts'
import { isTransferLike, knownCategories, merchantKey, suggestCategory } from './categories.ts'
import { categoryNames, existingKeys, findAccount, listAccounts, loadRules, lockCandidate, saveKey, saveRule, transferCandidates } from './import.repository.ts'
import { decodeText, pdfLines, readCsv } from './read.ts'
import { isGenericCsv, parseGeneric } from './generic.ts'
import { isSberText, parseSber } from './sber.ts'
import { isTbankCsv, parseTbank } from './tbank.ts'
import type { Bank, ParsedRow } from './types.ts'

export const MAX_STATEMENT_BYTES = 10 * 1024 * 1024
const UNKNOWN =
  'Не удалось распознать выписку. Подходят Т-Банк (CSV), Сбер (PDF) и CSV любого банка с колонками «Дата», «Сумма» (или «Приход» и «Расход») и «Описание»'

export async function parseStatement(buf: Buffer): Promise<{ bank: Bank; rows: ParsedRow[] }> {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') {
    let lines: string[]
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
  if (isGenericCsv(rows)) return { bank: 'csv', rows: parseGeneric(rows) }
  throw badRequest(UNKNOWN)
}

type KeyedRow = ParsedRow & { key: string }

function withKeys(accountId: number | string, rows: ParsedRow[]): KeyedRow[] {
  const seen = new Map<string, number>()
  return rows.map((r) => {
    const base = [accountId, r.date, r.time, r.kind, r.amount.toFixed(2), r.description.toLowerCase().replace(/\s+/g, ' ')].join('|')
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return { ...r, key: createHash('sha256').update(`${base}#${n}`).digest('hex').slice(0, 32) }
  })
}

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000

async function requireAccount(userId: number, accountId: unknown, client?: PoolClient) {
  const account = Number.isInteger(accountId) ? await findAccount(userId, accountId as number, client) : null
  if (!account) throw badRequest('Выберите счёт, к которому относится выписка')
  return account
}

export interface PreviewRow {
  key: string
  date: string
  time: string
  kind: 'income' | 'expense'
  amount: number
  description: string
  bank_category: string
  category: string
  duplicate: boolean
  match: { id: number; account_id: number; account_name: string } | null
}

export function decodeUpload(data: unknown): Buffer {
  if (typeof data !== 'string' || !data) throw badRequest('Файл не передан')
  const buf = Buffer.from(data.replace(/^data:[^,]*,/, ''), 'base64')
  if (!buf.length) throw badRequest('Файл пустой')
  if (buf.length > MAX_STATEMENT_BYTES) throw badRequest('Файл больше 10 МБ')
  return buf
}

/** Разбирает выписку и сопоставляет её с базой: дубли, переводы между своими счетами, категории. */
export async function buildPreview(
  userId: number,
  accountId: number,
  statement: Buffer | { bank: Bank; rows: ParsedRow[] },
): Promise<{ bank: Bank; rows: PreviewRow[] }> {
  const { bank, rows: parsed } = Buffer.isBuffer(statement) ? await parseStatement(statement) : statement
  if (!parsed.length) throw badRequest('В файле не нашлось ни одной операции')

  const account = await requireAccount(userId, accountId)
  const rows = withKeys(account.import_identity || accountId, parsed).sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
  const [dupes, rules, names] = await Promise.all([
    existingKeys(
      userId,
      rows.map((r) => r.key),
    ),
    loadRules(userId),
    categoryNames(userId),
  ])
  const known = knownCategories(names)

  const dates = rows.map((r) => r.date).sort()
  const candidates = (await transferCandidates(userId, accountId, addDays(dates[0], -2), addDays(dates[dates.length - 1], 2))).filter(isTransferLike)
  const used = new Set<number>()

  return {
    bank,
    rows: rows.map((r) => {
      const duplicate = dupes.has(r.key)
      let match: PreviewRow['match'] = null
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

export async function previewImport(userId: number, body: { account_id?: unknown; data?: unknown } | undefined) {
  const account = await requireAccount(userId, body?.account_id)
  const buf = decodeUpload(body?.data)
  const { bank, rows } = await buildPreview(userId, account.id, buf)
  return { bank, account_id: account.id, rows }
}

interface CleanRow {
  key: string
  date: string
  kind: 'income' | 'expense'
  amount: number
  category: string
  note: string
  match_id: number | null
  learn: boolean
}

function cleanRow(r: Record<string, unknown> | null | undefined): CleanRow {
  const amount = Number(r?.amount)
  if (typeof r?.key !== 'string' || !/^[0-9a-f]{32}$/.test(r.key)) throw badRequest('Неверная строка выписки')
  if (!isDate(r.date)) throw badRequest('Неверная дата в выписке')
  if (r.kind !== 'income' && r.kind !== 'expense') throw badRequest('Неверный тип операции')
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) throw badRequest('Неверная сумма в выписке')
  return {
    key: r.key,
    date: r.date,
    kind: r.kind,
    amount: Math.round(amount * 100) / 100,
    category: String(r.category ?? '')
      .trim()
      .slice(0, 100),
    note: String(r.description ?? '')
      .trim()
      .slice(0, 500),
    match_id: Number.isInteger(r.match_id) ? (r.match_id as number) : null,
    learn: r.learn === true,
  }
}

export interface ImportResult {
  created: number
  transfers: number
  skipped: number
}

export async function commitImport(userId: number, body: { account_id?: unknown; rows?: unknown } | undefined, client?: PoolClient): Promise<ImportResult> {
  if (!Array.isArray(body?.rows) || !body.rows.length) throw badRequest('Нет операций для сохранения')
  if (body.rows.length > 5000) throw badRequest('Слишком много операций за раз')
  const rows = body.rows.map(cleanRow)

  const run = async (c: PoolClient) => {
    await c.query('SELECT pg_advisory_xact_lock($1, $2)', [7262005, userId])
    const account = await requireAccount(userId, body.account_id, c)
    const result: ImportResult = { created: 0, transfers: 0, skipped: 0 }
    for (const r of rows) {
      if ((await existingKeys(userId, [r.key], c)).size) {
        result.skipped++
        continue
      }
      let id: number
      const pair = r.match_id ? await lockCandidate(userId, r.match_id, account.id, c) : null
      if (pair && pair.kind !== r.kind && Math.abs(pair.amount - r.amount) < 0.005) {
        const [from, to] = r.kind === 'expense' ? [account.id, pair.account_id] : [pair.account_id, account.id]
        await patchRow('transactions', pair.id, { kind: 'transfer', account_id: from, to_account_id: to, category: null }, userId, c)
        id = pair.id
        result.transfers++
      } else {
        const data = encode('transactions', {
          date: r.date,
          kind: r.kind,
          amount: r.amount,
          account_id: account.id,
          category: r.category || null,
          note: r.note || null,
        })
        id = (await insertRow('transactions', data, userId, c)).id
        result.created++
      }
      await saveKey(userId, r.key, id, c)
      const merchant = merchantKey(r.note)
      if (r.learn && r.category && merchant) await saveRule(userId, r.kind, merchant, r.category, c)
    }
    return result
  }
  return client
    ? run(client)
    : tx(async (c) => {
        await startAction(userId, 'Импорт выписки', c)
        return run(c)
      })
}

const bankNames: Record<Bank, RegExp | null> = { tbank: /т-?банк|тинькофф|tinkoff/i, sber: /сбер/i, csv: null }

/**
 * Куда записать выписку без вопросов: счёт, названный в подписи; иначе счёт с названием банка;
 * иначе основной счёт из настроек; иначе единственный счёт.
 */
export async function chooseAccount(userId: number, bank: Bank, hint: string | null, defaultId: number | null) {
  const accounts = await listAccounts(userId)
  const byHint = hint ? accounts.find((a) => a.name.toLowerCase().includes(hint.trim().toLowerCase())) : undefined
  const byBank = bankNames[bank] ? accounts.find((a) => bankNames[bank]!.test(a.name)) : undefined
  const byDefault = accounts.find((a) => a.id === defaultId)
  return byHint ?? byBank ?? byDefault ?? (accounts.length === 1 ? accounts[0] : null)
}

export interface AutoImportResult extends ImportResult {
  bank: Bank
  account: { id: number; name: string }
}

/** Импорт целиком без ручной проверки: так работает выписка, присланная боту. */
export async function importStatement(
  userId: number,
  buf: Buffer,
  opts: { hint?: string | null; defaultAccountId?: number | null } = {},
): Promise<AutoImportResult> {
  if (buf.length > MAX_STATEMENT_BYTES) throw badRequest('Файл больше 10 МБ')
  const statement = await parseStatement(buf)
  const account = await chooseAccount(userId, statement.bank, opts.hint ?? null, opts.defaultAccountId ?? null)
  if (!account) throw badRequest('Не понял, в какой счёт записать выписку. Напишите название счёта в подписи к файлу или создайте счёт в «Финансах»')
  const { bank, rows } = await buildPreview(userId, account.id, statement)
  const fresh = rows.filter((r) => !r.duplicate)
  if (!fresh.length) return { bank, account, created: 0, transfers: 0, skipped: rows.length }
  const result = await commitImport(userId, {
    account_id: account.id,
    rows: fresh.map((r) => ({ ...r, match_id: r.match?.id ?? null, learn: false })),
  })
  return { bank, account, ...result, skipped: result.skipped + rows.length - fresh.length }
}
