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

params=$(jq -n \
  --arg sync "aws s3 cp s3://$ARTIFACTS_BUCKET/deploy/$SERVICE/ /opt/whiteboard/ --recursive --region $AWS_REGION" \
  --arg run "ECR_REPO=$ECR_REPO AWS_REGION=$AWS_REGION bash /opt/whiteboard/deploy.sh $IMAGE_TAG" \
  '{commands: ["set -euo pipefail", $sync, $run], executionTimeout: ["900"]}')

command_id=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --comment "deploy $SERVICE ${IMAGE_TAG:0:7}" \
  --parameters "$params" \
  --query Command.CommandId --output text)
echo "SSM command ($SERVICE): $command_id"

status=Pending
for _ in $(seq 1 200); do
  sleep 5
  status=$(aws ssm get-command-invocation --command-id "$command_id" \
    --instance-id "$INSTANCE_ID" --query Status --output text 2>/dev/null || echo Pending)
  case "$status" in
    Pending|InProgress|Delayed) continue ;;
    *) break ;;
  esac
done

aws ssm get-command-invocation --command-id "$command_id" --instance-id "$INSTANCE_ID" \
  --query '[StandardOutputContent, StandardErrorContent]' --output text || true
echo "Status: $status"
[ "$status" = Success ]
