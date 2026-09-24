#!/bin/bash
# Deploy an API image tag on the api instance. Run as root (via SSM send-command):
#   ECR_REPO=<account>.dkr.ecr.<region>.amazonaws.com/whiteboard-api deploy.sh <tag>
# The tag it replaces is saved to previous.env for rollback.sh.
set -euo pipefail

TAG="${1:?usage: deploy.sh <image-tag>}"
: "${ECR_REPO:?ECR_REPO must be set}"
APP_DIR=/opt/whiteboard
SSM_PATH=/whiteboard/prod/

if [ -z "${AWS_REGION:-}" ]; then
  imds_token=$(curl -fsS -X PUT http://169.254.169.254/latest/api/token \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
  AWS_REGION=$(curl -fsS -H "X-aws-ec2-metadata-token: $imds_token" \
    http://169.254.169.254/latest/meta-data/placement/region)
fi
export AWS_REGION

cd "$APP_DIR"
compose() { docker compose --env-file "$APP_DIR/deploy.env" "$@"; }

echo "==> 1. Secrets from SSM ($SSM_PATH) -> .env"
umask 077
aws ssm get-parameters-by-path --path "$SSM_PATH" --recursive --with-decryption \
  --query 'Parameters[].[Name,Value]' --output text |
  awk -F '\t' -v prefix="$SSM_PATH" '{ sub("^" prefix, "", $1); print $1 "=" $2 }' > .env.tmp
grep -q '^DATABASE_URL=' .env.tmp || { echo "DATABASE_URL missing under $SSM_PATH" >&2; exit 1; }
grep '^POSTGRES_PASSWORD=' .env.tmp > postgres.env.tmp || { echo "POSTGRES_PASSWORD missing under $SSM_PATH" >&2; exit 1; }
mv .env.tmp .env
mv postgres.env.tmp postgres.env
chown root:root .env postgres.env
umask 022

echo "==> 2. ECR login"
aws ecr get-login-password --region "$AWS_REGION" |
  docker login --username AWS --password-stdin "${ECR_REPO%%/*}"

echo "==> 3. Image tag $TAG"
# Re-deploying the same tag keeps the older previous.env.
if [ -f deploy.env ] && ! grep -qx "API_IMAGE_TAG=$TAG" deploy.env; then
  cp deploy.env previous.env
  echo "    previous: $(grep '^API_IMAGE_TAG=' previous.env)"
fi
cat > deploy.env <<ENV
ECR_REPO=$ECR_REPO
API_IMAGE_TAG=$TAG
AWS_REGION=$AWS_REGION
ENV

echo "==> 4. Pull"
compose pull api

echo "==> 5. Postgres"
compose up -d --wait postgres

# Migrations must stay additive: rollback.sh restores the old image, not the old schema.
echo "==> 6. Migrations"
compose run --rm -T api npx prisma migrate deploy

echo "==> 7. Start api + caddy"
compose up -d --remove-orphans api caddy
# Caddy only reads its (bind-mounted) Caddyfile at start; recreate it when the file changed.
caddyfile_sum=$(sha256sum Caddyfile | cut -d ' ' -f 1)
if [ "$caddyfile_sum" != "$(cat .caddyfile.sha256 2>/dev/null || true)" ]; then
  compose up -d --force-recreate caddy
  echo "$caddyfile_sum" > .caddyfile.sha256
fi

# Unused images older than a week. The previous tag's image may go too; rollback.sh
# pulls it again from ECR (which keeps the last 10).
docker image prune -f >/dev/null
docker image prune -af --filter "until=168h" >/dev/null

echo "==> Deployed $TAG"
