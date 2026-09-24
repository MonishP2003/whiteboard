#!/bin/bash
# Deploy a frontend image tag on the frontend instance. Run as root (via SSM send-command):
#   ECR_REPO=<account>.dkr.ecr.<region>.amazonaws.com/whiteboard-frontend deploy.sh <tag>
# If the new container doesn't become healthy, it rolls back to the previous tag and fails.
set -euo pipefail

TAG="${1:?usage: deploy.sh <image-tag>}"
: "${ECR_REPO:?ECR_REPO must be set}"
APP_DIR=/opt/whiteboard

if [ -z "${AWS_REGION:-}" ]; then
  imds_token=$(curl -fsS -X PUT http://169.254.169.254/latest/api/token \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
  AWS_REGION=$(curl -fsS -H "X-aws-ec2-metadata-token: $imds_token" \
    http://169.254.169.254/latest/meta-data/placement/region)
fi
export AWS_REGION

cd "$APP_DIR"
compose() { docker compose --env-file "$APP_DIR/deploy.env" "$@"; }

echo "==> 1. ECR login"
aws ecr get-login-password --region "$AWS_REGION" |
  docker login --username AWS --password-stdin "${ECR_REPO%%/*}"

echo "==> 2. Image tag $TAG"
# Re-deploying the same tag keeps the older previous.env.
if [ -f deploy.env ] && ! grep -qx "FRONTEND_IMAGE_TAG=$TAG" deploy.env; then
  cp deploy.env previous.env
  echo "    previous: $(grep '^FRONTEND_IMAGE_TAG=' previous.env)"
fi
cat > deploy.env <<ENV
ECR_REPO=$ECR_REPO
FRONTEND_IMAGE_TAG=$TAG
AWS_REGION=$AWS_REGION
ENV

echo "==> 3. Pull"
compose pull frontend

echo "==> 4. Start frontend"
# --wait fails when the container's /healthz healthcheck doesn't pass.
if ! compose up -d --wait --remove-orphans frontend; then
  echo "frontend $TAG is unhealthy" >&2
  bash "$APP_DIR/rollback.sh" || echo "Rollback failed too" >&2
  exit 1
fi

# Unused images older than a week. The previous tag's image may go too; rollback.sh
# pulls it again from ECR (which keeps the last 10).
docker image prune -f >/dev/null
docker image prune -af --filter "until=168h" >/dev/null

echo "==> Deployed $TAG"
