terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # bucket and region come from backend.hcl (see backend.hcl.example).
  backend "s3" {
    key          = "prod/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { project = var.project, env = "prod" }
  }
}

data "aws_caller_identity" "current" {}

locals {
  name       = "${var.project}-prod"
  account_id = data.aws_caller_identity.current.account_id
  ssm_path   = "/${var.project}/prod"
}

# Not every AZ offers t4g; pick the first one that offers both instance types.
data "aws_ec2_instance_type_offerings" "arm" {
  for_each      = toset([var.api_instance_type, var.frontend_instance_type])
  location_type = "availability-zone"
  filter {
    name   = "instance-type"
    values = [each.value]
  }
}

module "network" {
  source = "../../modules/network"
  name   = local.name
  availability_zone = sort(setintersection(
    [for o in data.aws_ec2_instance_type_offerings.arm : o.locations]...
  ))[0]
}

# One ECR repo per service. These names are also hard-coded in bootstrap's
# deploy-role policy.
module "registry" {
  for_each = toset(["api", "frontend"])
  source   = "../../modules/registry"
  name     = "${var.project}-${each.value}"
}

# The artifacts bucket (deploy files + backups) belongs to the bootstrap stack, so
# destroying this stack keeps the backups. See modules/artifacts/README.md.
data "aws_s3_bucket" "artifacts" {
  bucket = "${local.name}-artifacts-${local.account_id}"
}

# One-time: forget the bucket this stack used to manage without deleting it. Harmless
# once applied; delete this block after that.
removed {
  from = module.artifacts
  lifecycle {
    destroy = false
  }
}

# Two instances, one per service. Both sit behind CloudFront (see module.cdn)
# and share the CloudFront-only security group.

# Fastify API + Postgres + Caddy.
module "api_server" {
  source             = "../../modules/compute"
  name               = "${local.name}-api"
  tags               = { service = "api" }
  instance_type      = var.api_instance_type
  subnet_id          = module.network.subnet_id
  security_group_id  = module.network.security_group_id
  ssm_parameter_path = local.ssm_path

  artifacts_bucket_arn     = data.aws_s3_bucket.artifacts.arn
  artifacts_read_prefixes  = ["deploy/api/"]
  artifacts_write_prefixes = ["backups/"] # backup.sh / restore.sh
}

# Static React build served by Caddy. No secrets, no database.
module "frontend_server" {
  source            = "../../modules/compute"
  name              = "${local.name}-frontend"
  tags              = { service = "frontend" }
  instance_type     = var.frontend_instance_type
  subnet_id         = module.network.subnet_id
  security_group_id = module.network.security_group_id

  artifacts_bucket_arn    = data.aws_s3_bucket.artifacts.arn
  artifacts_read_prefixes = ["deploy/frontend/"]
}

module "cdn" {
  source                 = "../../modules/cdn"
  name                   = local.name
  frontend_origin_domain = module.frontend_server.public_dns
  api_origin_domain      = module.api_server.public_dns
}

module "observability" {
  source = "../../modules/observability"
  name   = local.name
  log_group_names = {
    api      = "${local.ssm_path}/api"
    frontend = "${local.ssm_path}/frontend"
  }
  instance_ids = {
    api      = module.api_server.instance_id
    frontend = module.frontend_server.instance_id
  }
  budget_name            = local.name
  credit_burn_budget_usd = var.credit_burn_budget_usd
  alert_email            = var.alert_email
}

module "backup" {
  source           = "../../modules/backup"
  name             = local.name
  instance_id      = module.api_server.instance_id
  artifacts_bucket = data.aws_s3_bucket.artifacts.bucket
  alerts_topic_arn = module.observability.alerts_topic_arn
}

# --- State moves from the single-instance layout -----------------------------
# Keep the existing api instance, ECR repo and distribution. The S3 web bucket, its
# OAC and the SPA-rewrite function are destroyed. (The artifacts bucket moves were
# dropped in Stage 9, when the bucket left this stack.)

moved {
  from = module.compute
  to   = module.api_server
}

moved {
  from = module.registry
  to   = module.registry["api"]
}

moved {
  from = module.frontend.aws_cloudfront_distribution.this
  to   = module.cdn.aws_cloudfront_distribution.this
}

moved {
  from = module.observability.aws_cloudwatch_log_group.api
  to   = module.observability.aws_cloudwatch_log_group.service["api"]
}

# App secrets. Placeholders only: set real values once with
#   aws ssm put-parameter --overwrite --type SecureString --name ... --value ...
# deploy.sh writes every parameter under this path into /opt/whiteboard/.env.
resource "aws_ssm_parameter" "app" {
  for_each = toset([
    "DATABASE_URL",
    "JWT_SECRET",
    "POSTGRES_PASSWORD",
    "GEMINI_API_KEY",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
  ])
  name  = "${local.ssm_path}/${each.value}"
  type  = "SecureString"
  value = "change-me"

  lifecycle {
    ignore_changes = [value]
  }
}
