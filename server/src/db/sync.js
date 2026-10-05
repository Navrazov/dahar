import { query, q } from './pool.js'
import { schema, isRef, tableOrder, sqlType } from './schema.js'

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
`

function columnDdl(type) {
  if (!isRef(type)) return sqlType[type]
  const action = type.onDelete === 'cascade' ? 'CASCADE' : 'SET NULL'
  return `integer REFERENCES ${q(type.ref)}(id) ON DELETE ${action}`
}

export async function ensureSchema() {
  await query(systemTables)

  for (const table of tableOrder) {
    await query(`CREATE TABLE IF NOT EXISTS ${q(table)} (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now()
    )`)
    await query(`CREATE INDEX IF NOT EXISTS ${q(`idx_${table}_user`)} ON ${q(table)}(user_id)`)
  }
  for (const table of tableOrder) {
    for (const [col, type] of Object.entries(schema[table])) {
      await query(`ALTER TABLE ${q(table)} ADD COLUMN IF NOT EXISTS ${q(col)} ${columnDdl(type)}`)
      if (isRef(type)) await query(`CREATE INDEX IF NOT EXISTS ${q(`idx_${table}_${col}`)} ON ${q(table)}(${q(col)})`)
    }
  }
  await query('CREATE UNIQUE INDEX IF NOT EXISTS idx_habit_logs_day ON habit_logs(habit_id, date)')
  await query('CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_week ON reviews(user_id, week_start)')
  await query('CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_category ON budgets(user_id, category)')
  await query(`
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
}
