variable "name" {
  description = "Prefix for alarm and topic names."
  type        = string
}

variable "log_group_names" {
  description = "One CloudWatch log group per service, keyed by service name. Must include \"api\"."
  type        = map(string)
}

variable "instance_ids" {
  description = "EC2 instances to alarm on (status checks, memory, disk), keyed by a short name."
  type        = map(string)
  default     = {}
}

variable "budget_name" {
  type = string
}

variable "budget_limit_usd" {
  type    = number
  default = 1
}

variable "credit_burn_budget_usd" {
  description = "Monthly spend before credits to be warned about (e.g. your credit burn target). null: no such budget."
  type        = number
  default     = null
}

variable "alert_email" {
  type = string
}

data "aws_caller_identity" "current" {}

resource "aws_cloudwatch_log_group" "service" {
  for_each          = var.log_group_names
  name              = each.value
  retention_in_days = 14
}

# --- Alert topic ------------------------------------------------------------------
# Alarms and the backup-failure rule (modules/backup) publish here. The email
# subscription stays "pending confirmation" until you click the link AWS sends.

resource "aws_sns_topic" "alerts" {
  name = "${var.name}-alerts"
}

data "aws_iam_policy_document" "alerts" {
  statement {
    sid       = "AccountOwner"
    actions   = ["sns:*"]
    resources = [aws_sns_topic.alerts.arn]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  statement {
    sid       = "AwsServicesPublish"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com", "events.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts.json
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

locals {
  alarm_actions = [aws_sns_topic.alerts.arn]
}

# --- API 5xx ------------------------------------------------------------------------
# Fastify logs one JSON line per request ("request completed") with res.statusCode.

resource "aws_cloudwatch_log_metric_filter" "api_5xx" {
  name           = "${var.name}-api-5xx"
  log_group_name = aws_cloudwatch_log_group.service["api"].name
  pattern        = "{ $.res.statusCode >= 500 }"

  metric_transformation {
    namespace = "Whiteboard"
    name      = "Api5xx"
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${var.name}-api-5xx"
  alarm_description   = "5 or more API responses with status >= 500 in 5 minutes."
  namespace           = "Whiteboard"
  metric_name         = aws_cloudwatch_log_metric_filter.api_5xx.metric_transformation[0].name
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching" # no 5xx lines = no data points
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# --- Instances ----------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "status_check" {
  for_each            = var.instance_ids
  alarm_name          = "${var.name}-${each.key}-status-check"
  alarm_description   = "EC2 system or instance status check failing for 5 minutes."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed"
  dimensions          = { InstanceId = each.value }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 5
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# Memory and disk come from the CloudWatch agent (see compute/user_data.sh). Metrics
# Insights queries match on InstanceId and path without having to spell out every
# dimension the agent adds (device, fstype, ...).

resource "aws_cloudwatch_metric_alarm" "memory" {
  for_each            = var.instance_ids
  alarm_name          = "${var.name}-${each.key}-memory"
  alarm_description   = "Memory above 90% for 15 minutes."
  evaluation_periods  = 3
  threshold           = 90
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "missing"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  metric_query {
    id          = "mem"
    expression  = "SELECT AVG(mem_used_percent) FROM CWAgent WHERE InstanceId = '${each.value}'"
    period      = 300
    return_data = true
  }
}

# Old Docker images are what usually fills the disk; deploy.sh prunes them after a week.
resource "aws_cloudwatch_metric_alarm" "disk" {
  for_each            = var.instance_ids
  alarm_name          = "${var.name}-${each.key}-disk"
  alarm_description   = "Root volume above 80% full."
  evaluation_periods  = 1
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "missing"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  metric_query {
    id          = "disk"
    expression  = "SELECT MAX(used_percent) FROM CWAgent WHERE InstanceId = '${each.value}' AND path = '/'"
    period      = 300
    return_data = true
  }
}

# --- Budgets ------------------------------------------------------------------------

resource "aws_budgets_budget" "monthly" {
  name         = var.budget_name
  budget_type  = "COST"
  limit_amount = tostring(var.budget_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}

# The budget above counts what you pay after credits; this one counts gross usage,
# i.e. how fast the credits are going.
resource "aws_budgets_budget" "credit_burn" {
  count        = var.credit_burn_budget_usd == null ? 0 : 1
  name         = "${var.budget_name}-credit-burn"
  budget_type  = "COST"
  limit_amount = tostring(var.credit_burn_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_types {
    include_credit = false
    include_refund = false
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}

output "log_group_names" {
  value = { for k, g in aws_cloudwatch_log_group.service : k => g.name }
}

output "alerts_topic_arn" {
  value = aws_sns_topic.alerts.arn
}
