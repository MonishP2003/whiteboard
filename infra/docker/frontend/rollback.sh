#!/bin/bash
# Put the frontend image from before the last deploy back. Run as root on the frontend
# instance; deploy.sh calls it when the new container is unhealthy:
#   bash /opt/whiteboard/rollback.sh
set -euo pipefail

APP_DIR=/opt/whiteboard
cd "$APP_DIR"
compose() { docker compose --env-file "$APP_DIR/deploy.env" "$@"; }

[ -f previous.env ] || { echo "No previous.env: nothing to roll back to" >&2; exit 1; }
from=$(grep '^FRONTEND_IMAGE_TAG=' deploy.env | cut -d = -f 2)
to=$(grep '^FRONTEND_IMAGE_TAG=' previous.env | cut -d = -f 2)
echo "==> Rolling back frontend: $from -> $to"

set -a
. ./previous.env
set +a
aws ecr get-login-password --region "$AWS_REGION" |
  docker login --username AWS --password-stdin "${ECR_REPO%%/*}"

cp previous.env deploy.env
compose up -d --wait frontend # pulls the image again if the prune removed it
echo "==> Rolled back to $to"
