import type { PoolClient } from 'pg'
import { pool, query, tx, q } from './pool.ts'
import { fieldsOf, sqlType, tableOrder } from './schema.ts'
import { storeFile } from '../modules/files/files.storage.ts'

export interface Migration {
  id: string
  up(c: PoolClient): Promise<void>
}

async function columnType(c: PoolClient, table: string, column: string): Promise<string | null> {
  const { rows } = await query('SELECT data_type FROM information_schema.columns WHERE table_name = $1 AND column_name = $2', [table, column], c)
  return rows[0]?.data_type ?? null
}

export const migrations: Migration[] = [
  {
    id: '001_exact_money',
    async up(c) {
      for (const table of tableOrder) {
        for (const [col, def] of fieldsOf(table)) {
          if (def.type !== 'money' && def.type !== 'decimal') continue
          if ((await columnType(c, table, col)) === 'double precision') {
            await query(
              `ALTER TABLE ${q(table)} ALTER COLUMN ${q(col)} TYPE ${sqlType[def.type]} USING round(${q(col)}::numeric, ${def.type === 'money' ? 2 : 8})`,
              [],
              c,
            )
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
         SELECT user_id, id, created_at::date, applications, approvals, turnover, profit, 'Перенесено из карточки партнёра'
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
      const { rows } = await query<{ id: number; user_id: number; screenshot: string }>(
        `SELECT id, user_id, screenshot FROM trades WHERE screenshot LIKE 'data:%'`,
        [],
        c,
      )
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
  {
    // Даты, время и «настенные» метки времени хранились текстом. Переводим в настоящие типы;
    // то, что не разбирается, становится NULL, а не роняет миграцию.
    id: '005_typed_dates',
    async up(c) {
      await query(
        String.raw`
        CREATE FUNCTION pg_temp.dahar_date(v text) RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
        BEGIN
          IF v ~ '^\d{4}-\d{2}-\d{2}' THEN RETURN substr(v, 1, 10)::date; END IF;
          RETURN NULL;
        EXCEPTION WHEN others THEN RETURN NULL;
        END $$;
        CREATE FUNCTION pg_temp.dahar_time(v text) RETURNS time LANGUAGE plpgsql IMMUTABLE AS $$
        BEGIN
          IF v ~ '^\d{1,2}:\d{2}' THEN RETURN substring(v from '^\d{1,2}:\d{2}')::time; END IF;
          RETURN NULL;
        EXCEPTION WHEN others THEN RETURN NULL;
        END $$;
        CREATE FUNCTION pg_temp.dahar_timestamp(v text) RETURNS timestamp LANGUAGE plpgsql IMMUTABLE AS $$
        BEGIN
          IF v ~ '^\d{4}-\d{2}-\d{2}([T ]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?)?$' THEN RETURN replace(v, 'T', ' ')::timestamp; END IF;
          RETURN NULL;
        EXCEPTION WHEN others THEN RETURN NULL;
        END $$;`,
        [],
        c,
      )
      for (const table of tableOrder) {
        for (const [col, def] of fieldsOf(table)) {
          if (def.type !== 'date' && def.type !== 'time' && def.type !== 'datetime') continue
          if ((await columnType(c, table, col)) !== 'text') continue
          const fn = def.type === 'datetime' ? 'timestamp' : def.type
          await query(`ALTER TABLE ${q(table)} ALTER COLUMN ${q(col)} TYPE ${sqlType[def.type]} USING pg_temp.dahar_${fn}(${q(col)})`, [], c)
        }
      }
    },
  },
]

type Log = (message: string) => void

export async function runMigrations({ log = console.log as Log } = {}) {
  const { rows } = await query<{ id: string }>('SELECT id FROM schema_migrations')
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

const MIGRATION_LOCK = 7_262_001

/** Схема и миграции под общей блокировкой: несколько экземпляров могут стартовать одновременно. */
export async function migrate(opts?: { log?: Log }) {
  const { ensureSchema } = await import('./sync.ts')
  const lock = await pool.connect()
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK])
    await ensureSchema()
    await runMigrations(opts)
  } finally {
    await lock.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => {})
    lock.release()
  }
}
