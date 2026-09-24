variable "name" {
  type = string
}

variable "instance_id" {
  description = "The api instance (runs Postgres)."
  type        = string
}

variable "artifacts_bucket" {
  type = string
}

variable "schedule" {
  description = "When to run backup.sh. Cron is in UTC; the default is 02:00 IST."
  type        = string
  default     = "cron(30 20 * * ? *)"
}

variable "alerts_topic_arn" {
  description = "SNS topic told when a backup run fails."
  type        = string
}

# Runs /opt/whiteboard/backup.sh (copied there by every API deploy) on a schedule.
# Lives in Terraform rather than a cron entry on the box, so it survives instance
# replacement and changes without touching the instance.
resource "aws_ssm_association" "pg_dump" {
  association_name    = "${var.name}-pg-dump"
  name                = "AWS-RunShellScript"
  schedule_expression = var.schedule
  # Don't run immediately on create: right after `apply` the instance has no deploy yet.
  apply_only_at_cron_interval = true

  targets {
    key    = "InstanceIds"
    values = [var.instance_id]
  }

  parameters = {
    commands         = "ARTIFACTS_BUCKET=${var.artifacts_bucket} bash /opt/whiteboard/backup.sh"
    executionTimeout = "1800"
  }
}

resource "aws_cloudwatch_event_rule" "backup_failed" {
  name        = "${var.name}-backup-failed"
  description = "Nightly pg_dump association failed."
  event_pattern = jsonencode({
    source        = ["aws.ssm"]
    "detail-type" = ["EC2 State Manager Instance Association State Change"]
    detail = {
      "association-id" = [aws_ssm_association.pg_dump.association_id]
      status           = ["Failed"]
    }
  })
}

resource "aws_cloudwatch_event_target" "backup_failed" {
  rule = aws_cloudwatch_event_rule.backup_failed.name
  arn  = var.alerts_topic_arn
}
