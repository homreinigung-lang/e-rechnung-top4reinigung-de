#!/usr/bin/env bash
set -euo pipefail

# Read-only database/Auth backup helper for one Supabase source.
# Usage: bash scripts/backup-db-auth.sh <source-name> <output-dir>
# Example: bash scripts/backup-db-auth.sh lovable-prod ../gebcalc-migration/lovable-prod/db

SOURCE_NAME="${1:-}"
OUT_DIR="${2:-}"

if [[ -z "$SOURCE_NAME" || -z "$OUT_DIR" ]]; then
  echo "Usage: bash scripts/backup-db-auth.sh <source-name> <output-dir>" >&2
  exit 2
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is not installed or not on PATH." >&2
  exit 2
fi
if ! command -v sha256sum >/dev/null 2>&1; then
  echo "sha256sum is not installed or not on PATH." >&2
  exit 2
fi

mkdir -p "$OUT_DIR"

printf 'Paste the PostgreSQL connection URI for %s (input hidden): ' "$SOURCE_NAME" >&2
IFS= read -r -s DB_URL
echo >&2
if [[ -z "$DB_URL" ]]; then
  echo "No database URI entered." >&2
  exit 2
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="$OUT_DIR/${SOURCE_NAME}-${STAMP}.dump"
META="$OUT_DIR/${SOURCE_NAME}-${STAMP}.meta.txt"

# Full database dump includes Supabase auth schema data when the supplied database
# account has access. This command is read-only against the source database.
pg_dump \
  --dbname="$DB_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$DUMP"

unset DB_URL

{
  echo "source=$SOURCE_NAME"
  echo "created_utc=$STAMP"
  echo "pg_dump_version=$(pg_dump --version)"
  echo "dump_file=$(basename "$DUMP")"
  echo "sha256=$(sha256sum "$DUMP" | awk '{print $1}')"
} > "$META"

sha256sum "$DUMP" > "$DUMP.sha256"

echo "BACKUP_OK: $DUMP"
echo "CHECKSUM_OK: $DUMP.sha256"
echo "META_OK: $META"
