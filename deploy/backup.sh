#!/usr/bin/env bash
# Daily PostgreSQL backup for the CIP deployment.
#
# Run from the deploy/ directory (project env is loaded by docker compose):
#   ./backup.sh
#
# Cron example (every day at 02:30):
#   30 2 * * * cd /home/deploy/aeo/deploy && COMPOSE_PROJECT_NAME=aeo COMPOSE_FILE=docker-compose.shared.yml ./backup.sh >> /home/deploy/aeo/deploy/backups/backup.log 2>&1
#
# Copy backups off the server regularly (e.g. rclone to object storage, or
# rsync to another host) — a backup on the same disk is not a backup.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/aeo-$STAMP.dump.gz"

docker compose exec -T postgres \
  sh -lc 'pg_dump --format=custom -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  | gzip > "$OUT"

# Keep only the last KEEP_DAYS of backups.
find "$BACKUP_DIR" -name 'aeo-*.dump.gz' -mtime +"$KEEP_DAYS" -delete

echo "[$(date -Is)] backup written: $OUT"

# Restore example (custom format, restores into a fresh DB):
#   gunzip -c aeo-YYYYMMDD-HHMMSS.dump.gz | docker compose exec -T postgres \
#     pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists
