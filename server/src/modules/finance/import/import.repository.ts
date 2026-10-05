import { query, type Db } from '../../../db/pool.ts'

export interface Candidate {
  id: number
  date: string
  kind: 'income' | 'expense'
  amount: number
  account_id: number
  category: string | null
  note: string | null
  account_name: string
}

export async function findAccount(userId: number, accountId: number, client?: Db) {
  const { rows } = await query<{ id: number; name: string }>('SELECT id, name FROM accounts WHERE id = $1 AND user_id = $2', [accountId, userId], client)
  return rows[0]
}

export async function listAccounts(userId: number) {
  const { rows } = await query<{ id: number; name: string }>('SELECT id, name FROM accounts WHERE user_id = $1 AND archived IS NOT TRUE ORDER BY id', [userId])
  return rows
}

export async function existingKeys(userId: number, keys: string[], client?: Db) {
  const { rows } = await query('SELECT key FROM statement_imports WHERE user_id = $1 AND key = ANY($2)', [userId, keys], client)
  return new Set<string>(rows.map((r) => r.key))
}

export async function saveKey(userId: number, key: string, transactionId: number, client?: Db) {
  const { rowCount } = await query(
    'INSERT INTO statement_imports (user_id, key, transaction_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [userId, key, transactionId],
    client,
  )
  return (rowCount ?? 0) > 0
}

export async function loadRules(userId: number) {
  const { rows } = await query('SELECT kind, merchant, category FROM category_rules WHERE user_id = $1', [userId])
  return new Map<string, string>(rows.map((r) => [`${r.kind}:${r.merchant}`, r.category]))
}

export async function saveRule(userId: number, kind: string, merchant: string, category: string, client?: Db) {
  await query(
    `INSERT INTO category_rules (user_id, kind, merchant, category) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, kind, merchant) DO UPDATE SET category = EXCLUDED.category, updated_at = now()`,
    [userId, kind, merchant, category],
    client,
  )
}

export async function categoryNames(userId: number): Promise<string[]> {
  const { rows } = await query(
    `SELECT category FROM transactions WHERE user_id = $1 AND category IS NOT NULL AND category <> ''
     UNION SELECT category FROM budgets WHERE user_id = $1`,
    [userId],
  )
  return rows.map((r) => r.category)
}

export async function transferCandidates(userId: number, accountId: number, from: string, to: string) {
  const { rows } = await query<Candidate>(
    `SELECT t.id, t.date, t.kind, t.amount, t.account_id, t.category, t.note, a.name AS account_name
     FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.user_id = $1 AND t.account_id <> $2 AND t.kind IN ('income', 'expense') AND t.date BETWEEN $3 AND $4`,
    [userId, accountId, from, to],
  )
  return rows
}

export async function lockCandidate(userId: number, id: number, accountId: number, client?: Db) {
  const { rows } = await query<Pick<Candidate, 'id' | 'kind' | 'amount' | 'account_id'>>(
    `SELECT id, kind, amount, account_id FROM transactions
     WHERE id = $1 AND user_id = $2 AND account_id <> $3 AND kind IN ('income', 'expense') FOR UPDATE`,
    [id, userId, accountId],
    client,
  )
  return rows[0]
}
