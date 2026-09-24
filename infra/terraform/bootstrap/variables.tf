variable "region" {
  type    = string
  default = "ap-south-1"
}

variable "project" {
  type    = string
  default = "whiteboard"
}

variable "github_repo" {
  description = "owner/repo whose workflows may assume the CI roles."
  type        = string
  default     = "MonishP2003/whiteboard"
}
