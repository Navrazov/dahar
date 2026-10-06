#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${DATABASE_URL:?Set DATABASE_URL without printing it}"
: "${BACKUP_DIR:?Set a directory outside the repository}"
command -v pg_dump >/dev/null
mkdir -p "$BACKUP_DIR"
backup_path="$BACKUP_DIR/dahar-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-acl --file="$backup_path.partial"
pg_restore --list "$backup_path.partial" >/dev/null
mv "$backup_path.partial" "$backup_path"
shasum -a 256 "$backup_path" > "$backup_path.sha256"
printf 'Backup completed: %s\n' "$backup_path"
