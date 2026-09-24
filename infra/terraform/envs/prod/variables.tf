variable "region" {
  type    = string
  default = "ap-south-1"
}

variable "project" {
  type    = string
  default = "whiteboard"
}

variable "api_instance_type" {
  description = "Runs the API, Postgres and Caddy."
  type        = string
  default     = "t4g.micro"
}

variable "frontend_instance_type" {
  description = "Serves the static build only; t4g.nano is enough if you want to save a little."
  type        = string
  default     = "t4g.micro"
}

variable "alert_email" {
  description = "Receives budget alerts, CloudWatch alarms and backup failures (confirm the SNS email once)."
  type        = string
}

variable "credit_burn_budget_usd" {
  description = "Warn when forecast monthly usage before credits exceeds this. null: off."
  type        = number
  default     = null
}
