import { query } from '../../../db/pool.js'

export async function findAccount(userId, accountId, client) {
  const { rows } = await query('SELECT id, name FROM accounts WHERE id = $1 AND user_id = $2', [accountId, userId], client)
  return rows[0]
}

export async function existingKeys(userId, keys, client) {
  const { rows } = await query('SELECT key FROM statement_imports WHERE user_id = $1 AND key = ANY($2)', [userId, keys], client)
  return new Set(rows.map((r) => r.key))
}

export async function saveKey(userId, key, transactionId, client) {
  const { rowCount } = await query(
    'INSERT INTO statement_imports (user_id, key, transaction_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [userId, key, transactionId],
    client,
  )
  return rowCount > 0
}

export async function loadRules(userId) {
  const { rows } = await query('SELECT kind, merchant, category FROM category_rules WHERE user_id = $1', [userId])
  return new Map(rows.map((r) => [`${r.kind}:${r.merchant}`, r.category]))
}

export async function saveRule(userId, kind, merchant, category, client) {
  await query(
    `INSERT INTO category_rules (user_id, kind, merchant, category) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, kind, merchant) DO UPDATE SET category = EXCLUDED.category, updated_at = now()`,
    [userId, kind, merchant, category],
    client,
  )
}

export async function categoryNames(userId) {
  const { rows } = await query(
    `SELECT category FROM transactions WHERE user_id = $1 AND category IS NOT NULL AND category <> ''
     UNION SELECT category FROM budgets WHERE user_id = $1`,
    [userId],
  )
  return rows.map((r) => r.category)
}

export async function transferCandidates(userId, accountId, from, to) {
  const { rows } = await query(
    `SELECT t.id, t.date, t.kind, t.amount, t.account_id, t.category, t.note, a.name AS account_name
     FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.user_id = $1 AND t.account_id <> $2 AND t.kind IN ('income', 'expense') AND t.date BETWEEN $3 AND $4`,
    [userId, accountId, from, to],
  )
  return rows
}

export async function lockCandidate(userId, id, accountId, client) {
  const { rows } = await query(
    `SELECT id, kind, amount, account_id FROM transactions
     WHERE id = $1 AND user_id = $2 AND account_id <> $3 AND kind IN ('income', 'expense') FOR UPDATE`,
    [id, userId, accountId],
    client,
  )
  return rows[0]
}
