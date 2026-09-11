#!/usr/bin/env bash
# Daily PostgreSQL backup for the CIP deployment.
#
# Run from the deploy/ directory (so .env is picked up):
#   ./backup.sh
#
# Cron example (every day at 02:30):
#   30 2 * * * cd /opt/aeo/deploy && ./backup.sh >> /var/log/aeo-backup.log 2>&1
#
# Copy backups off the server regularly (e.g. rclone to object storage, or
# rsync to another host) — a backup on the same disk is not a backup.
set -euo pipefail

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"
DB_USER="${POSTGRES_USER:-aeo}"
DB_NAME="${POSTGRES_DB:-aeo}"
export PGPASSWORD="${POSTGRES_PASSWORD:-}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/aeo-$STAMP.dump.gz"

docker compose exec -T postgres \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom \
  | gzip > "$OUT"

# Keep only the last KEEP_DAYS of backups.
find "$BACKUP_DIR" -name 'aeo-*.dump.gz' -mtime +"$KEEP_DAYS" -delete

echo "[$(date -Is)] backup written: $OUT"

# Restore example (custom format, restores into a fresh DB):
#   gunzip -c aeo-YYYYMMDD-HHMMSS.dump.gz | docker compose exec -T postgres \
#     pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists
