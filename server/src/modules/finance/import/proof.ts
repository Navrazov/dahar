import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { query, type Db } from '../../../db/pool.ts'
import { badRequest } from '../../../lib/errors.ts'

export async function importSigningKey(client?: Db) {
  await query(
    "INSERT INTO app_config(key,value) VALUES('import-signing-key',$1) ON CONFLICT DO NOTHING",
    [JSON.stringify(randomBytes(32).toString('hex'))],
    client,
  )
  return String((await query("SELECT value FROM app_config WHERE key='import-signing-key'", [], client)).rows[0].value)
}
interface SignedRow {
  key: string
  date: string
  kind: string
  amount: number
  currency?: string
}
const message = (user: number, account: number, row: SignedRow) => JSON.stringify([user, account, row.key, row.date, row.kind, row.amount, row.currency || ''])
export function signImportRow(secret: string, user: number, account: number, row: SignedRow) {
  return createHmac('sha256', secret)
    .update(message(user, account, row))
    .digest('hex')
}
export function verifyImportRow(secret: string, user: number, account: number, row: SignedRow, proof: unknown) {
  const expected = signImportRow(secret, user, account, row)
  if (typeof proof !== 'string' || !/^[a-f0-9]{64}$/.test(proof) || !timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(proof, 'hex')))
    throw badRequest('Выписка изменена или её проверка устарела. Загрузите файл заново')
}
