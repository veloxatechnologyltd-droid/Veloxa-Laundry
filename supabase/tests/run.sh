#!/usr/bin/env bash
# Apply all migrations to a throwaway Postgres (with stubbed Supabase auth/storage)
# and run the SQL tests. Needs docker + psql. Usage: supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

NAME=veloxa-sqltest-$$
PORT=${PORT:-55499}
export PGPASSWORD=pw
P="psql -h localhost -p $PORT -U postgres -q -X -v ON_ERROR_STOP=1"

docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=pw -p "$PORT:5432" postgres:16 >/dev/null
trap 'docker rm -f "$NAME" >/dev/null' EXIT
until $P -c 'select 1' >/dev/null 2>&1; do sleep 1; done

$P -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do echo "migrate $f"; $P -f "$f"; done
for f in supabase/tests/[1-9]*.sql; do echo "test $f"; $P -f "$f"; done
