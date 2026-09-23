variable "log_group_names" {
  description = "One CloudWatch log group per service, keyed by service name."
  type        = map(string)
}

variable "budget_name" {
  type = string
}

variable "budget_limit_usd" {
  type    = number
  default = 1
}

variable "alert_email" {
  type = string
}

resource "aws_cloudwatch_log_group" "service" {
  for_each          = var.log_group_names
  name              = each.value
  retention_in_days = 14
}

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

output "log_group_names" {
  value = { for k, g in aws_cloudwatch_log_group.service : k => g.name }
}
