#!/bin/bash
# pg_dump the whiteboard database to s3://<bucket>/backups/<YYYY-MM-DD>.dump.
# Run as root on the api instance; the SSM association in modules/backup runs it nightly:
#   ARTIFACTS_BUCKET=<bucket> bash /opt/whiteboard/backup.sh
set -euo pipefail
: "${ARTIFACTS_BUCKET:?ARTIFACTS_BUCKET must be set}"

APP_DIR=/opt/whiteboard
cd "$APP_DIR"
compose() { docker compose --env-file "$APP_DIR/deploy.env" "$@"; }

key="backups/$(date -u +%F).dump"
# Dump to disk first so a failed pg_dump never leaves a truncated object in S3.
tmp=$(mktemp /var/tmp/whiteboard-backup.XXXXXX)
trap 'rm -f "$tmp"' EXIT

# -T: no TTY, or the binary custom-format output gets mangled.
compose exec -T postgres pg_dump -U whiteboard -Fc whiteboard > "$tmp"
[ -s "$tmp" ] || { echo "pg_dump produced an empty file" >&2; exit 1; }

aws s3 cp "$tmp" "s3://$ARTIFACTS_BUCKET/$key" --only-show-errors
echo "==> Backed up $(du -h "$tmp" | cut -f 1) to s3://$ARTIFACTS_BUCKET/$key"
