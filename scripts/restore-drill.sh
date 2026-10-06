#!/usr/bin/env bash
set -euo pipefail
: "${RESTORE_DATABASE_URL:?Set an empty isolated database ending in _restore_test}"
backup_path="${1:?Pass the .dump path}"
restore_database_name="${RESTORE_DATABASE_URL%%\?*}"
restore_database_name="${restore_database_name##*/}"
if [[ ! "$restore_database_name" =~ _restore_test$ ]]; then
  printf 'Refusing restore: target must end in _restore_test\n' >&2
  exit 1
fi
psql --dbname="$RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "DO \$\$ BEGIN IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public') THEN RAISE EXCEPTION 'Target must be empty'; END IF; END \$\$;" >/dev/null
restore_started_at=$SECONDS
pg_restore --exit-on-error --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" "$backup_path"
psql --dbname="$RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c 'SELECT count(*) AS users FROM users; SELECT count(*) AS tasks FROM tasks; SELECT count(*) AS database_files FROM files WHERE data IS NOT NULL;'
printf 'Restore finished in %s seconds. Verify S3 independently if configured.\n' "$((SECONDS-restore_started_at))"
