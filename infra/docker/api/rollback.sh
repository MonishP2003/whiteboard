#!/bin/bash
# Put the API image from before the last deploy back. Run as root on the api instance
# (deploy.yml does this via SSM when /api/health fails after a deploy):
#   bash /opt/whiteboard/rollback.sh
# Restores code only; the database schema stays as the new release migrated it.
set -euo pipefail

APP_DIR=/opt/whiteboard
cd "$APP_DIR"
compose() { docker compose --env-file "$APP_DIR/deploy.env" "$@"; }

[ -f previous.env ] || { echo "No previous.env: nothing to roll back to" >&2; exit 1; }
from=$(grep '^API_IMAGE_TAG=' deploy.env | cut -d = -f 2)
to=$(grep '^API_IMAGE_TAG=' previous.env | cut -d = -f 2)
echo "==> Rolling back api: $from -> $to"

set -a
. ./previous.env
set +a
aws ecr get-login-password --region "$AWS_REGION" |
  docker login --username AWS --password-stdin "${ECR_REPO%%/*}"

cp previous.env deploy.env
compose up -d api # pulls the image again if the prune removed it
echo "==> Rolled back to $to"
