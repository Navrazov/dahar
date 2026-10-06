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
        CREATE OR REPLACE FUNCTION pg_temp.dahar_date(v text) RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
        BEGIN
          IF v ~ '^\d{4}-\d{2}-\d{2}' THEN RETURN substr(v, 1, 10)::date; END IF;
          RETURN NULL;
        EXCEPTION WHEN others THEN RETURN NULL;
        END $$;
        CREATE OR REPLACE FUNCTION pg_temp.dahar_time(v text) RETURNS time LANGUAGE plpgsql IMMUTABLE AS $$
        BEGIN
          IF v ~ '^\d{1,2}:\d{2}' THEN RETURN substring(v from '^\d{1,2}:\d{2}')::time; END IF;
          RETURN NULL;
        EXCEPTION WHEN others THEN RETURN NULL;
        END $$;
        CREATE OR REPLACE FUNCTION pg_temp.dahar_timestamp(v text) RETURNS timestamp LANGUAGE plpgsql IMMUTABLE AS $$
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
  {
    id: '006_reliability_and_history',
    async up(c) {
      await query(
        `
        UPDATE goals SET period_start=date_trunc('month',created_at)::date,period_end=(date_trunc('month',created_at)+interval '1 month - 1 day')::date WHERE metric LIKE '%_month' AND period_start IS NULL;
        UPDATE events SET external_uid=gen_random_uuid()::text || '@dahar' WHERE external_uid IS NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS events_external_uid ON events(user_id,external_uid) WHERE external_uid IS NOT NULL;
        ALTER TABLE accounts ADD COLUMN IF NOT EXISTS import_identity text;
        UPDATE accounts SET import_identity=id::text WHERE import_identity IS NULL;
        ALTER TABLE accounts ALTER COLUMN import_identity SET DEFAULT gen_random_uuid()::text;
        CREATE UNIQUE INDEX IF NOT EXISTS accounts_import_identity ON accounts(user_id,import_identity) WHERE import_identity IS NOT NULL;
        CREATE TABLE IF NOT EXISTS request_operations(user_id integer REFERENCES users(id) ON DELETE CASCADE, key text, fingerprint text NOT NULL,
          response jsonb NOT NULL, status integer NOT NULL, action_id bigint, created_at timestamptz DEFAULT now(), PRIMARY KEY(user_id,key));
        CREATE TABLE IF NOT EXISTS history_actions(id bigserial PRIMARY KEY,user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          label text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),undone_at timestamptz);
        CREATE INDEX IF NOT EXISTS history_actions_user ON history_actions(user_id,id);
        CREATE TABLE IF NOT EXISTS history_changes(id bigserial PRIMARY KEY,action_id bigint NOT NULL REFERENCES history_actions(id) ON DELETE CASCADE,
          table_name text NOT NULL,before_row jsonb,after_row jsonb);
        CREATE INDEX IF NOT EXISTS history_changes_action ON history_changes(action_id,id);
        CREATE TABLE IF NOT EXISTS saved_backups(id bigserial PRIMARY KEY,user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
        CREATE TABLE IF NOT EXISTS product_events(user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,event text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,event));
        CREATE TABLE IF NOT EXISTS notification_deliveries(user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,key text NOT NULL,channel text NOT NULL,
          attempts integer NOT NULL DEFAULT 0,delivered_at timestamptz,next_attempt_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY(user_id,key,channel));
        CREATE OR REPLACE FUNCTION dahar_capture_change() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE action bigint;
        BEGIN
          action := NULLIF(current_setting('dahar.action',true),'')::bigint;
          IF action IS NOT NULL THEN
            INSERT INTO history_changes(action_id,table_name,before_row,after_row)
            VALUES(action,TG_TABLE_NAME,CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
          END IF;
          RETURN NULL;
        END $$;
      `,
        [],
        c,
      )
      for (const table of tableOrder) await query(`CREATE INDEX IF NOT EXISTS ${q('idx_' + table + '_user_id_cursor')} ON ${q(table)}(user_id,id DESC)`, [], c)
      const constraints = (
        await query(
          "SELECT c.conrelid::regclass::text AS table_name,c.conname FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE c.contype='f' AND n.nspname='public'",
          [],
          c,
        )
      ).rows
      for (const constraint of constraints)
        await query(`ALTER TABLE ${q(constraint.table_name)} ALTER CONSTRAINT ${q(constraint.conname)} DEFERRABLE INITIALLY IMMEDIATE`, [], c)
      for (const table of [...tableOrder, 'settings', 'statement_imports', 'category_rules'])
        await query(
          `CREATE OR REPLACE TRIGGER dahar_history AFTER INSERT OR UPDATE OR DELETE ON ${q(table)} FOR EACH ROW EXECUTE FUNCTION dahar_capture_change()`,
          [],
          c,
        )
    },
  },
  {
    id: '007_admin_reporting_indexes',
    up: async (c) => {
      await query(
        `
        CREATE INDEX IF NOT EXISTS idx_users_admin_created ON users(created_at DESC,id DESC);
        CREATE INDEX IF NOT EXISTS idx_users_admin_seen ON users(last_seen_at DESC NULLS LAST,id DESC);
        CREATE INDEX IF NOT EXISTS idx_error_log_source_created ON error_log(source,created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_error_log_user_created ON error_log(user_id,created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_admin_audit_action_cursor ON admin_audit(action,id DESC);
      `,
        [],
        c,
      )
      for (const table of tableOrder) await query(`CREATE INDEX IF NOT EXISTS ${q('idx_' + table + '_created_at')} ON ${q(table)}(created_at)`, [], c)
    },
  },
  {
    id: '008_launch_safety',
    up: async (c) => {
      await query(
        `
        ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS claim_token uuid;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS dataset_version integer NOT NULL DEFAULT 1;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
        CREATE TABLE IF NOT EXISTS rate_limits (
          key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL
        );
        CREATE TABLE IF NOT EXISTS behavior_daily (
          user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          day date NOT NULL, event text NOT NULL, count integer NOT NULL DEFAULT 1,
          PRIMARY KEY(user_id,day,event)
        );
        CREATE TABLE IF NOT EXISTS ai_generation_locks(user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,token uuid NOT NULL,expires_at timestamptz NOT NULL);
        CREATE TABLE IF NOT EXISTS ai_runs(user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,key text NOT NULL,week_start date NOT NULL,status text NOT NULL,content jsonb,input_tokens integer,output_tokens integer,cost_usd numeric,model text,duration_ms integer,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,key));
        CREATE TABLE IF NOT EXISTS file_deletions (storage_key text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now());
        CREATE TABLE IF NOT EXISTS subscriptions (
          user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          paid_until timestamptz, cancel_at_period_end boolean NOT NULL DEFAULT true,
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_request_operations_created ON request_operations(created_at);
        CREATE INDEX IF NOT EXISTS idx_notification_next ON notification_deliveries(next_attempt_at);
        INSERT INTO settings(user_id,key,value)
          SELECT id,'modules','{"finance":{"enabled":true}}'::jsonb FROM users
          ON CONFLICT(user_id,key) DO UPDATE SET value=jsonb_set(settings.value,'{finance}',
            COALESCE(settings.value->'finance','{"enabled":true}'::jsonb));
      `,
        [],
        c,
      )
    },
  },
  {
    id: '009_admin_control_center',
    up: async (c) => {
      await query(
        `
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_miniapp_at timestamptz;
        ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS last_error text;
        ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS last_error text;
        CREATE TABLE IF NOT EXISTS payments (
          id bigserial PRIMARY KEY,
          user_id integer REFERENCES users(id) ON DELETE SET NULL,
          provider text NOT NULL,
          provider_payment_id text NOT NULL,
          status text NOT NULL CHECK(status IN ('pending','succeeded','failed','canceled','refunded','partially_refunded')),
          plan text CHECK(plan IN ('monthly','yearly')),
          amount numeric(16,2) NOT NULL CHECK(amount > 0),
          currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
          refunded_amount numeric(16,2) NOT NULL DEFAULT 0 CHECK(refunded_amount >= 0 AND refunded_amount <= amount),
          created_at timestamptz NOT NULL DEFAULT now(),
          paid_at timestamptz,
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE(provider,provider_payment_id)
        );
        CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC,id DESC);
        CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id,created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status,created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_ai_runs_created ON ai_runs(created_at DESC);
      `,
        [],
        c,
      )
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
