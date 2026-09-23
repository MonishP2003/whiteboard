#!/bin/bash
# Deploy an API image tag on the api instance. Run as root (via SSM send-command):
#   ECR_REPO=<account>.dkr.ecr.<region>.amazonaws.com/whiteboard-api deploy.sh <tag>
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
cat > deploy.env <<EOF
ECR_REPO=$ECR_REPO
API_IMAGE_TAG=$TAG
AWS_REGION=$AWS_REGION
EOF

echo "==> 4. Pull"
compose pull api

echo "==> 5. Postgres"
compose up -d --wait postgres

echo "==> 6. Migrations"
compose run --rm -T api npx prisma migrate deploy

echo "==> 7. Start api + caddy"
compose up -d --remove-orphans api caddy
docker image prune -f >/dev/null

echo "==> Deployed $TAG"
