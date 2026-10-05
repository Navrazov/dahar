import { query, q } from './pool.ts'
import { dateColumn, fieldsOf, isRef, sqlType, tableOrder, type FieldDef } from './schema.ts'

const systemTables = `
  CREATE TABLE IF NOT EXISTS users (
    id serial PRIMARY KEY,
    login text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    name text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id bigint UNIQUE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at timestamptz;

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash text PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip text;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent text;
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS user_activity (
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day date NOT NULL,
    PRIMARY KEY (user_id, day)
  );
  CREATE INDEX IF NOT EXISTS idx_user_activity_day ON user_activity(day);

  CREATE TABLE IF NOT EXISTS settings (
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key text NOT NULL,
    value jsonb,
    PRIMARY KEY (user_id, key)
  );

  CREATE TABLE IF NOT EXISTS files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mime text NOT NULL,
    size integer NOT NULL,
    data bytea,
    storage_key text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);

  CREATE TABLE IF NOT EXISTS telegram_codes (
    code text PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
  );

  CREATE TABLE IF NOT EXISTS schema_migrations (
    id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS error_log (
    id bigserial PRIMARY KEY,
    source text NOT NULL,
    message text NOT NULL,
    stack text,
    context jsonb,
    user_id integer REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log(created_at);

  CREATE TABLE IF NOT EXISTS admins (
    id serial PRIMARY KEY,
    login text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash text PRIMARY KEY,
    admin_id integer NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    ip text,
    user_agent text,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS admin_audit (
    id bigserial PRIMARY KEY,
    admin_id integer REFERENCES admins(id) ON DELETE SET NULL,
    action text NOT NULL,
    target text,
    meta jsonb,
    ip text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit(created_at);

  ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret text;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending text;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step bigint;
  ALTER TABLE admins ADD COLUMN IF NOT EXISTS totp_secret text;
  ALTER TABLE admins ADD COLUMN IF NOT EXISTS totp_pending text;
  ALTER TABLE admins ADD COLUMN IF NOT EXISTS totp_last_step bigint;

  CREATE TABLE IF NOT EXISTS recovery_codes (
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash text NOT NULL,
    used_at timestamptz,
    PRIMARY KEY (user_id, code_hash)
  );

  CREATE TABLE IF NOT EXISTS app_config (
    key text PRIMARY KEY,
    value jsonb NOT NULL
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint text NOT NULL UNIQUE,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz
  );
  CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

  CREATE TABLE IF NOT EXISTS weekly_insights (
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start date NOT NULL,
    content jsonb NOT NULL,
    model text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, week_start)
  );

  CREATE TABLE IF NOT EXISTS login_challenges (
    token_hash text PRIMARY KEY,
    kind text NOT NULL,
    owner_id integer NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    expires_at timestamptz NOT NULL
  );
`

function columnDdl(def: FieldDef) {
  if (!isRef(def)) return sqlType[def.type]
  const action = def.onDelete === 'cascade' ? 'CASCADE' : 'SET NULL'
  return `integer REFERENCES ${q(def.ref)}(id) ON DELETE ${action}`
}

/** Таблицы и колонки создаются одним скриптом: на старте это один запрос, а не сотни. */
export function schemaScript() {
  const sql = [systemTables]
  for (const table of tableOrder) {
    sql.push(`CREATE TABLE IF NOT EXISTS ${q(table)} (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now()
    );`)
    sql.push(`CREATE INDEX IF NOT EXISTS ${q(`idx_${table}_user`)} ON ${q(table)}(user_id);`)
  }
  for (const table of tableOrder) {
    for (const [col, def] of fieldsOf(table)) {
      sql.push(`ALTER TABLE ${q(table)} ADD COLUMN IF NOT EXISTS ${q(col)} ${columnDdl(def)};`)
      if (isRef(def)) sql.push(`CREATE INDEX IF NOT EXISTS ${q(`idx_${table}_${col}`)} ON ${q(table)}(${q(col)});`)
    }
    const dc = dateColumn[table]
    if (dc) sql.push(`CREATE INDEX IF NOT EXISTS ${q(`idx_${table}_user_${dc}`)} ON ${q(table)}(user_id, ${q(dc)});`)
  }
  sql.push(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_habit_logs_day ON habit_logs(habit_id, date);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_week ON reviews(user_id, week_start);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_category ON budgets(user_id, category);

    CREATE TABLE IF NOT EXISTS statement_imports (
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key text NOT NULL,
      transaction_id integer NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, key)
    );
    CREATE INDEX IF NOT EXISTS idx_statement_imports_txn ON statement_imports(transaction_id);

    CREATE TABLE IF NOT EXISTS category_rules (
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind text NOT NULL,
      merchant text NOT NULL,
      category text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, kind, merchant)
    );
  `)
  return sql.join('\n')
}

export async function ensureSchema() {
  await query(schemaScript())
}
