#!/bin/bash
# Run infra/docker/<service>/deploy.sh on that service's instance via SSM and wait.
#   ssm-deploy.sh <service> <instance-id> <ecr-repo-url> <image-tag>
# Needs AWS_REGION and ARTIFACTS_BUCKET; the deploy files must already be in
# s3://$ARTIFACTS_BUCKET/deploy/<service>/.
set -euo pipefail

SERVICE="${1:?service}"
INSTANCE_ID="${2:?instance id}"
ECR_REPO="${3:?ecr repo url}"
IMAGE_TAG="${4:?image tag}"
: "${AWS_REGION:?}" "${ARTIFACTS_BUCKET:?}"

exec bash "$(dirname "$0")/ssm-run.sh" "$INSTANCE_ID" "deploy $SERVICE ${IMAGE_TAG:0:7}" \
  "aws s3 cp s3://$ARTIFACTS_BUCKET/deploy/$SERVICE/ /opt/whiteboard/ --recursive --region $AWS_REGION" \
  "ECR_REPO=$ECR_REPO AWS_REGION=$AWS_REGION bash /opt/whiteboard/deploy.sh $IMAGE_TAG"
