import { query, tx, q } from './pool.js'
import { schema, sqlType } from './schema.js'
import { storeFile } from '../modules/files/files.storage.js'

async function columnType(c, table, column) {
  const { rows } = await query(
    'SELECT data_type FROM information_schema.columns WHERE table_name = $1 AND column_name = $2',
    [table, column],
    c,
  )
  return rows[0]?.data_type ?? null
}

export const migrations = [
  {
    id: '001_exact_money',
    async up(c) {
      for (const [table, cols] of Object.entries(schema)) {
        for (const [col, type] of Object.entries(cols)) {
          if (type !== 'money' && type !== 'decimal') continue
          if ((await columnType(c, table, col)) === 'double precision') {
            await query(`ALTER TABLE ${q(table)} ALTER COLUMN ${q(col)} TYPE ${sqlType[type]} USING round(${q(col)}::numeric, ${type === 'money' ? 2 : 8})`, [], c)
          }
        }
      }
    },
  },
  {
    id: '002_partner_reports',
    async up(c) {
      if (!(await columnType(c, 'partners', 'applications'))) return
      await query(
        `INSERT INTO partner_reports (user_id, partner_id, date, applications, approvals, turnover, profit, note)
         SELECT user_id, id, to_char(created_at, 'YYYY-MM-DD'), applications, approvals, turnover, profit, 'Перенесено из карточки партнёра'
         FROM partners
         WHERE COALESCE(applications, 0) <> 0 OR COALESCE(approvals, 0) <> 0 OR COALESCE(turnover, 0) <> 0 OR COALESCE(profit, 0) <> 0`,
        [],
        c,
      )
      for (const col of ['applications', 'approvals', 'turnover', 'profit']) await query(`ALTER TABLE partners DROP COLUMN IF EXISTS ${q(col)}`, [], c)
    },
  },
  {
    id: '003_screenshots_to_files',
    async up(c) {
      const { rows } = await query(`SELECT id, user_id, screenshot FROM trades WHERE screenshot LIKE 'data:%'`, [], c)
      for (const r of rows) {
        const url = await storeFile(r.user_id, r.screenshot, c)
        await query('UPDATE trades SET screenshot = $1 WHERE id = $2', [url, r.id], c)
      }
    },
  },
  {
    id: '004_activity_backfill',
    async up(c) {
      await query(
        `INSERT INTO user_activity (user_id, day)
         SELECT DISTINCT user_id, (created_at AT TIME ZONE 'UTC')::date FROM sessions
         ON CONFLICT DO NOTHING`,
        [],
        c,
      )
    },
  },
]

export async function runMigrations({ log = console.log } = {}) {
  const { rows } = await query('SELECT id FROM schema_migrations')
  const done = new Set(rows.map((r) => r.id))
  for (const m of migrations) {
    if (done.has(m.id)) continue
    await tx(async (c) => {
      await m.up(c)
      await query('INSERT INTO schema_migrations (id) VALUES ($1)', [m.id], c)
    })
    log(`Migration applied: ${m.id}`)
  }
}

export async function migrate(opts) {
  const { ensureSchema } = await import('./sync.js')
  await ensureSchema()
  await runMigrations(opts)
}
