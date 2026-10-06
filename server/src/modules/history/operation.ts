import { createHash } from 'node:crypto'
import type { Request, Response } from 'express'
import type { PoolClient } from 'pg'
import { query, tx } from '../../db/pool.ts'
import { badRequest, HttpError } from '../../lib/errors.ts'

export async function startAction(userId: number, label: string, c: PoolClient) {
  await query('SELECT pg_advisory_xact_lock($1,$2)', [7262005, userId], c)
  const action = (await query('INSERT INTO history_actions(user_id,label) VALUES($1,$2) RETURNING id', [userId, label], c)).rows[0].id
  await query("SELECT set_config('dahar.action',$1,true)", [String(action)], c)
  return action
}

/** Response and writes commit together. A lost response can safely be replayed on any instance. */
export async function operation<T>(req: Request, res: Response, label: string, run: (c: PoolClient) => Promise<T>, status = 200, recordHistory = true) {
  const key = req.get('Idempotency-Key') || null
  if (key && !/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw badRequest('Неверный идентификатор операции')
  const fingerprint = createHash('sha256')
    .update(JSON.stringify([req.method, req.originalUrl, req.body]))
    .digest('hex')
  const reply = await tx(async (c) => {
    await query('SELECT pg_advisory_xact_lock($1, $2)', [7262005, req.user.id], c)
    const generation = req.get('X-Dahar-Dataset')
    const current = (await query('SELECT dataset_version FROM users WHERE id=$1', [req.user.id], c)).rows[0]?.dataset_version
    if (generation && generation !== String(current))
      throw new HttpError(409, 'Данные восстановлены из копии. Старое изменение не применено; проверьте его вручную')
    if (key) {
      const { rows } = await query('SELECT * FROM request_operations WHERE user_id=$1 AND key=$2', [req.user.id, key], c)
      if (rows[0]) {
        if (rows[0].fingerprint !== fingerprint) throw new HttpError(409, 'Этот идентификатор уже использован для другого изменения')
        return { body: rows[0].response, status: rows[0].status, action: rows[0].action_id }
      }
    }
    const action = recordHistory ? await startAction(req.user.id, label, c) : null
    const body = await run(c)
    if (key)
      await query(
        'INSERT INTO request_operations(user_id,key,fingerprint,response,status,action_id) VALUES($1,$2,$3,$4,$5,$6)',
        [req.user.id, key, fingerprint, JSON.stringify(body), status, action],
        c,
      )
    return { body, status, action }
  })
  if (reply.action !== null) res.setHeader('X-Dahar-Action', String(reply.action))
  res.status(reply.status).json(reply.body)
}
