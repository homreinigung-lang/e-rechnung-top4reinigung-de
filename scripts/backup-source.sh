#!/usr/bin/env bash
set -euo pipefail

# One-command, read-only backup for one Supabase source.
# It captures a full PostgreSQL dump (including auth schema when accessible)
# and every object from the private Storage bucket with SHA-256 metadata.
# No source write, upload, SQL mutation, DNS change, or deployment is performed.

SOURCE_NAME="${1:-}"
ROOT="${2:-../gebcalc-migration}"

if [[ -z "$SOURCE_NAME" ]]; then
  echo "Usage: bash scripts/backup-source.sh <source-name> [migration-root]" >&2
  echo "Example: bash scripts/backup-source.sh lovable-prod" >&2
  exit 2
fi

SOURCE_DIR="$ROOT/$SOURCE_NAME"
DB_DIR="$SOURCE_DIR/db"
STORAGE_DIR="$SOURCE_DIR/storage"
mkdir -p "$DB_DIR" "$STORAGE_DIR"

bash "$(dirname "$0")/backup-db-auth.sh" "$SOURCE_NAME" "$DB_DIR"

printf 'Supabase project URL for %s (for example https://PROJECT.supabase.co): ' "$SOURCE_NAME" >&2
IFS= read -r SUPABASE_URL_INPUT
if [[ -z "$SUPABASE_URL_INPUT" ]]; then
  echo "No Supabase URL entered." >&2
  exit 2
fi

printf 'Supabase secret/service-role key for %s (input hidden): ' "$SOURCE_NAME" >&2
IFS= read -r -s SUPABASE_SECRET_INPUT
echo >&2
if [[ -z "$SUPABASE_SECRET_INPUT" ]]; then
  echo "No Supabase secret key entered." >&2
  exit 2
fi

SUPABASE_URL="$SUPABASE_URL_INPUT" \
SUPABASE_SECRET_KEY="$SUPABASE_SECRET_INPUT" \
node "$(dirname "$0")/download-storage.mjs" "$SOURCE_NAME" "$STORAGE_DIR"

unset SUPABASE_URL_INPUT SUPABASE_SECRET_INPUT

echo "SOURCE_BACKUP_OK: $SOURCE_NAME"
echo "OUTPUT: $SOURCE_DIR"
