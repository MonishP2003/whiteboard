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
  description = "Receives the AWS Budget alert."
  type        = string
}
