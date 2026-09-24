#!/bin/bash
# Restore a pg_dump from S3 into the running Postgres, replacing what's there.
# Run as root on the api instance after a deploy (so Postgres is up):
#   ARTIFACTS_BUCKET=<bucket> bash /opt/whiteboard/restore.sh [YYYY-MM-DD]
# Without a date it restores the newest backup.
set -euo pipefail
: "${ARTIFACTS_BUCKET:?ARTIFACTS_BUCKET must be set}"

APP_DIR=/opt/whiteboard
cd "$APP_DIR"
compose() { docker compose --env-file "$APP_DIR/deploy.env" "$@"; }

if [ -n "${1:-}" ]; then
  key="backups/$1.dump"
else
  key=$(aws s3api list-objects-v2 --bucket "$ARTIFACTS_BUCKET" --prefix backups/ \
    --query 'sort_by(Contents, &LastModified)[-1].Key' --output text)
  [ "$key" != None ] || { echo "No backups in s3://$ARTIFACTS_BUCKET/backups/" >&2; exit 1; }
fi

tmp=$(mktemp /var/tmp/whiteboard-restore.XXXXXX)
trap 'rm -f "$tmp"' EXIT
aws s3 cp "s3://$ARTIFACTS_BUCKET/$key" "$tmp" --only-show-errors

echo "==> Restoring $key"
# Stop the API so nothing writes mid-restore; Postgres keeps running.
compose stop api
compose exec -T postgres pg_restore -U whiteboard -d whiteboard \
  --clean --if-exists --no-owner --single-transaction < "$tmp"
compose up -d api
echo "==> Restored $key"
