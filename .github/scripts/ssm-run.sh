#!/bin/bash
# Run shell commands on an instance via SSM (AWS-RunShellScript), wait, print the output.
#   ssm-run.sh <instance-id> <comment> <command> [<command>...]
# Exits non-zero unless the command succeeded. Needs AWS_REGION.
set -euo pipefail

INSTANCE_ID="${1:?instance id}"
COMMENT="${2:?comment}"
shift 2
[ "$#" -gt 0 ] || { echo "no commands" >&2; exit 2; }
: "${AWS_REGION:?}"

params=$(jq -n --args '{commands: (["set -euo pipefail"] + $ARGS.positional), executionTimeout: ["900"]}' "$@")

command_id=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --comment "$COMMENT" \
  --parameters "$params" \
  --query Command.CommandId --output text)
echo "SSM command ($COMMENT): $command_id"

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
