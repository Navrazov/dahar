import { query, tx } from '../../db/pool.ts'
import { randomToken, sha256 } from '../../lib/crypto.ts'
import { newRecoveryCodes, newSecret, normalizeRecoveryCode, otpauthUrl, verifyTotp } from '../../lib/totp.ts'

/** Чьи учётные записи защищаем: пользователи и администраторы хранят TOTP в своих таблицах. */
export type Owner = 'users' | 'admins'

export type ChallengeKind = 'user' | 'admin' | 'admin_setup'

const CHALLENGE_MINUTES = 5
const MAX_ATTEMPTS = 5

interface TotpState {
  totp_secret: string | null
  totp_pending: string | null
  totp_last_step: number | null
}

async function state(owner: Owner, id: number): Promise<TotpState | undefined> {
  const { rows } = await query<TotpState>(`SELECT totp_secret, totp_pending, totp_last_step FROM ${owner} WHERE id = $1`, [id])
  return rows[0]
}

export async function isEnabled(owner: Owner, id: number) {
  return !!(await state(owner, id))?.totp_secret
}

/** Новый секрет ждёт подтверждения кодом; включается только после enable. */
export async function beginSetup(owner: Owner, id: number, account: string) {
  const secret = newSecret()
  await query(`UPDATE ${owner} SET totp_pending = $1 WHERE id = $2`, [secret, id])
  return { secret, otpauth: otpauthUrl(secret, account) }
}

/** Подтверждает настройку кодом из приложения. */
export async function confirmSetup(owner: Owner, id: number, code: unknown) {
  const s = await state(owner, id)
  if (!s?.totp_pending) return false
  const step = verifyTotp(s.totp_pending, code)
  if (step === null) return false
  await query(`UPDATE ${owner} SET totp_secret = totp_pending, totp_pending = NULL, totp_last_step = $1 WHERE id = $2`, [step, id])
  return true
}

/** Проверяет код и запоминает шаг, чтобы тот же код нельзя было использовать повторно. */
export async function checkCode(owner: Owner, id: number, code: unknown) {
  const s = await state(owner, id)
  if (!s?.totp_secret) return false
  const step = verifyTotp(s.totp_secret, code, s.totp_last_step)
  if (step === null) return false
  const { rowCount } = await query(`UPDATE ${owner} SET totp_last_step = $1 WHERE id = $2 AND (totp_last_step IS NULL OR totp_last_step < $1)`, [step, id])
  return (rowCount ?? 0) > 0
}

export async function disable(owner: Owner, id: number) {
  await query(`UPDATE ${owner} SET totp_secret = NULL, totp_pending = NULL, totp_last_step = NULL WHERE id = $1`, [id])
  if (owner === 'users') await query('DELETE FROM recovery_codes WHERE user_id = $1', [id])
}

export async function issueRecoveryCodes(userId: number) {
  const codes = newRecoveryCodes()
  await tx(async (c) => {
    await query('DELETE FROM recovery_codes WHERE user_id = $1', [userId], c)
    for (const code of codes) await query('INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, $2)', [userId, sha256(normalizeRecoveryCode(code))], c)
  })
  return codes
}

export async function useRecoveryCode(userId: number, code: unknown) {
  const normalized = normalizeRecoveryCode(code)
  if (normalized.length !== 8) return false
  const { rowCount } = await query('UPDATE recovery_codes SET used_at = now() WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL', [
    userId,
    sha256(normalized),
  ])
  return (rowCount ?? 0) > 0
}

export async function recoveryLeft(userId: number) {
  const { rows } = await query<{ n: number }>('SELECT count(*)::int AS n FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL', [userId])
  return rows[0].n
}

/** Пароль уже проверен, ждём второй фактор. Билет короткоживущий и с ограничением попыток. */
export async function startChallenge(kind: ChallengeKind, ownerId: number) {
  const ticket = randomToken()
  await query('DELETE FROM login_challenges WHERE expires_at < now()')
  await query(`INSERT INTO login_challenges (token_hash, kind, owner_id, expires_at) VALUES ($1, $2, $3, now() + make_interval(mins => $4))`, [
    sha256(ticket),
    kind,
    ownerId,
    CHALLENGE_MINUTES,
  ])
  return ticket
}

/** Возвращает владельца билета и засчитывает попытку; после лимита билет сгорает. */
export async function readChallenge(kinds: ChallengeKind[], ticket: unknown): Promise<{ kind: ChallengeKind; ownerId: number } | null> {
  if (typeof ticket !== 'string' || !ticket) return null
  const { rows } = await query<{ kind: ChallengeKind; owner_id: number; attempts: number }>(
    `UPDATE login_challenges SET attempts = attempts + 1
     WHERE token_hash = $1 AND kind = ANY($2) AND expires_at > now()
     RETURNING kind, owner_id, attempts`,
    [sha256(ticket), kinds],
  )
  const row = rows[0]
  if (!row) return null
  if (row.attempts > MAX_ATTEMPTS) {
    await endChallenge(ticket)
    return null
  }
  return { kind: row.kind, ownerId: row.owner_id }
}

export async function endChallenge(ticket: string) {
  await query('DELETE FROM login_challenges WHERE token_hash = $1', [sha256(ticket)])
}
