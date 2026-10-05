import { config } from '../../config.js'
import { query } from '../../db/pool.js'
import { badRequest } from '../../lib/errors.js'

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

let s3Promise = null

function s3() {
  if (!config.s3) return null
  s3Promise ??= import('@aws-sdk/client-s3').then((m) => ({
    m,
    client: new m.S3Client({
      region: config.s3.region,
      endpoint: config.s3.endpoint,
      credentials: { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey },
    }),
  }))
  return s3Promise
}

export const storageLabel = () => (config.s3 ? `s3://${config.s3.bucket}` : 'postgres')

export const fileUrl = (id) => `/api/files/${id}`

export async function storeFile(userId, dataUrl, client) {
  const m = /^data:([\w/+.-]+);base64,(.+)$/s.exec(String(dataUrl || ''))
  if (!m) throw badRequest('Ожидается изображение в формате data URL')
  const mime = m[1]
  if (!ALLOWED.has(mime)) throw badRequest('Поддерживаются JPG, PNG, WebP и GIF')
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length > MAX_BYTES) throw badRequest('Файл больше 8 МБ')

  const store = await s3()
  if (!store) {
    const { rows } = await query('INSERT INTO files (user_id, mime, size, data) VALUES ($1, $2, $3, $4) RETURNING id', [userId, mime, buf.length, buf], client)
    return fileUrl(rows[0].id)
  }
  const { rows } = await query('INSERT INTO files (user_id, mime, size) VALUES ($1, $2, $3) RETURNING id', [userId, mime, buf.length], client)
  const key = `${userId}/${rows[0].id}`
  await store.client.send(new store.m.PutObjectCommand({ Bucket: config.s3.bucket, Key: key, Body: buf, ContentType: mime }))
  await query('UPDATE files SET storage_key = $1 WHERE id = $2', [key, rows[0].id], client)
  return fileUrl(rows[0].id)
}

export async function readFile(userId, id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { rows } = await query('SELECT mime, data, storage_key FROM files WHERE id = $1 AND user_id = $2', [id, userId])
  const f = rows[0]
  if (!f) return null
  if (f.data) return { mime: f.mime, body: f.data }
  const store = await s3()
  if (!store || !f.storage_key) return null
  const obj = await store.client.send(new store.m.GetObjectCommand({ Bucket: config.s3.bucket, Key: f.storage_key }))
  return { mime: f.mime, body: Buffer.from(await obj.Body.transformToByteArray()) }
}

export async function fileAsDataUrl(userId, url) {
  const f = await readFile(userId, String(url).split('/').pop())
  return f ? `data:${f.mime};base64,${f.body.toString('base64')}` : null
}

export async function cleanupOrphanFiles() {
  const { rows } = await query(`
    DELETE FROM files f
    WHERE f.created_at < now() - interval '1 day'
      AND NOT EXISTS (SELECT 1 FROM trades t WHERE t.screenshot = '/api/files/' || f.id::text)
    RETURNING storage_key`)
  const store = await s3()
  if (store) {
    for (const r of rows) {
      if (r.storage_key) await store.client.send(new store.m.DeleteObjectCommand({ Bucket: config.s3.bucket, Key: r.storage_key })).catch(() => {})
    }
  }
  return rows.length
}
