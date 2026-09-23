variable "region" {
  type    = string
  default = "ap-south-1"
}

variable "project" {
  type    = string
  default = "whiteboard"
}

variable "github_repo" {
  description = "owner/repo allowed to assume the deploy role (main branch only)."
  type        = string
  default     = "MonishP2003/whiteboard"
}
