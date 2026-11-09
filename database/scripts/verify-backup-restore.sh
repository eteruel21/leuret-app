#!/bin/sh

set -eu

pg_user="${PGUSER:-postgres}"
pg_host="${PGHOST:-/var/run/postgresql}"
source_database="${BACKUP_TEST_SOURCE_DATABASE:-test_leuret}"
restore_database="${BACKUP_TEST_RESTORE_DATABASE:-test_leuret_restore}"
backup_path="/tmp/${source_database}_backup_restore_test.dump"

case "$pg_host" in
  /var/run/postgresql|localhost|127.0.0.1|::1) ;;
  *)
    echo "Backup/restore test refuses remote PGHOST: $pg_host" >&2
    exit 1
    ;;
esac

case "$source_database" in
  test_*) ;;
  *)
    echo "Source database must start with test_." >&2
    exit 1
    ;;
esac

case "$restore_database" in
  *restore*|*backup*) ;;
  *)
    echo "Restore database must contain restore or backup." >&2
    exit 1
    ;;
esac

if [ "$source_database" = "$restore_database" ]; then
  echo "Source and restore databases must be different." >&2
  exit 1
fi

cleanup() {
  dropdb \
    --host "$pg_host" \
    --username "$pg_user" \
    --if-exists \
    --force \
    "$restore_database" >/dev/null 2>&1 || true
  rm -f "$backup_path"
}

trap cleanup EXIT HUP INT TERM

query() {
  database="$1"
  sql="$2"

  psql \
    --host "$pg_host" \
    --username "$pg_user" \
    --dbname "$database" \
    --no-align \
    --tuples-only \
    --set ON_ERROR_STOP=1 \
    --command "$sql"
}

echo "[Backup/restore] Dumping isolated source database."
pg_dump \
  --host "$pg_host" \
  --username "$pg_user" \
  --dbname "$source_database" \
  --format custom \
  --blobs \
  --file "$backup_path"

test -s "$backup_path"
sha256sum "$backup_path"

dropdb \
  --host "$pg_host" \
  --username "$pg_user" \
  --if-exists \
  --force \
  "$restore_database"

createdb \
  --host "$pg_host" \
  --username "$pg_user" \
  "$restore_database"

echo "[Backup/restore] Restoring into disposable database."
pg_restore \
  --host "$pg_host" \
  --username "$pg_user" \
  --dbname "$restore_database" \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  "$backup_path"

table_count_sql="
  SELECT count(*)
  FROM information_schema.tables
  WHERE table_type = 'BASE TABLE'
    AND table_schema IN (
      'app',
      'app_auth',
      'app_migrations',
      'private',
      'public'
    );
"

migration_signature_sql="
  SELECT filename || ':' || checksum
  FROM app_migrations.schema_migrations
  ORDER BY filename;
"

source_table_count="$(query "$source_database" "$table_count_sql")"
restore_table_count="$(query "$restore_database" "$table_count_sql")"

if [ "$source_table_count" -lt 1 ]; then
  echo "Source database has no application tables." >&2
  exit 1
fi

if [ "$source_table_count" != "$restore_table_count" ]; then
  echo "Table count mismatch: source=$source_table_count restore=$restore_table_count" >&2
  exit 1
fi

source_migrations="$(query "$source_database" "$migration_signature_sql")"
restore_migrations="$(query "$restore_database" "$migration_signature_sql")"

if [ -z "$source_migrations" ]; then
  echo "Source database has no migration history." >&2
  exit 1
fi

if [ "$source_migrations" != "$restore_migrations" ]; then
  echo "Migration checksum history does not match." >&2
  exit 1
fi

echo "[Backup/restore] Recovery verified: $restore_table_count application tables."
