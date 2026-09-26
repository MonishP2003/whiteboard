# One-time bootstrap: Terraform state bucket, artifacts bucket (deploy files +
# backups), GitHub OIDC provider and the CI roles. Applied by hand with local
# state; see the root README.md.

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { project = var.project, env = "bootstrap" }
  }
}

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id

  # Names the prod stack creates. They are derived here (not read from prod
  # state) because bootstrap is applied before prod exists.
  state_bucket     = "${var.project}-tfstate-${local.account_id}"
  artifacts_bucket = "${var.project}-prod-artifacts-${local.account_id}"
  ecr_repos        = ["${var.project}-api", "${var.project}-frontend"]
}

# --- Terraform state bucket -------------------------------------------------

resource "aws_s3_bucket" "state" {
  bucket = local.state_bucket
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# --- Artifacts bucket -----------------------------------------------------------
# Here rather than in envs/prod so that destroying prod keeps the database backups.
# See "The artifacts bucket" in the root README.md.

module "artifacts" {
  source      = "../modules/artifacts"
  bucket_name = local.artifacts_bucket
}

# --- GitHub OIDC ------------------------------------------------------------

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "deploy_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name               = "gh-actions-deploy"
  assume_role_policy = data.aws_iam_policy_document.deploy_trust.json
}

data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [for r in local.ecr_repos : "arn:aws:ecr:${var.region}:${local.account_id}:repository/${r}"]
  }

  statement {
    sid       = "SsmSendToTaggedInstance"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:aws:ec2:${var.region}:${local.account_id}:instance/*"]
    condition {
      test     = "StringEquals"
      variable = "ssm:resourceTag/project"
      values   = [var.project]
    }
    condition {
      test     = "StringEquals"
      variable = "ssm:resourceTag/env"
      values   = ["prod"]
    }
  }

  statement {
    sid       = "SsmRunShellScript"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:aws:ssm:${var.region}::document/AWS-RunShellScript"]
  }

  statement {
    sid       = "SsmReadInvocations"
    actions   = ["ssm:GetCommandInvocation"]
    resources = ["*"] # no resource-level permissions for this action
  }

  statement {
    sid     = "S3DeployFiles"
    actions = ["s3:ListBucket", "s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = [
      "arn:aws:s3:::${local.artifacts_bucket}",
      "arn:aws:s3:::${local.artifacts_bucket}/deploy/*",
    ]
  }

  statement {
    sid       = "ReadProdStateList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.state.arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["prod/*"]
    }
  }

  statement {
    sid       = "ReadProdState"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.state.arn}/prod/*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}

# --- Terraform plan (infra.yml: pull requests and main) -----------------------
# Read-only. Plans run with -lock=false, so no write access to the state bucket.

data "aws_iam_policy_document" "plan_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repo}:pull_request",
        "repo:${var.github_repo}:ref:refs/heads/main",
      ]
    }
  }
}

resource "aws_iam_role" "plan" {
  name               = "gh-actions-plan"
  assume_role_policy = data.aws_iam_policy_document.plan_trust.json
}

resource "aws_iam_role_policy_attachment" "plan_read_only" {
  role       = aws_iam_role.plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

data "aws_iam_policy_document" "plan" {
  # Refreshing aws_ssm_parameter reads SecureString values, which needs the aws/ssm key.
  statement {
    sid       = "DecryptSsmParameters"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.region}.amazonaws.com"]
    }
  }

  # ReadOnlyAccess would otherwise let any PR's workflow download the database dumps.
  statement {
    sid       = "NoBackups"
    effect    = "Deny"
    actions   = ["s3:GetObject", "s3:GetObjectVersion"]
    resources = ["${module.artifacts.bucket_arn}/backups/*"]
  }
}

resource "aws_iam_role_policy" "plan" {
  name   = "plan"
  role   = aws_iam_role.plan.id
  policy = data.aws_iam_policy_document.plan.json
}

# --- Terraform apply (infra.yml: the production environment) -----------------
# Only jobs in the "production" GitHub environment (required reviewer) get this
# token subject, so every apply waits for an approval.

data "aws_iam_policy_document" "apply_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:environment:production"]
    }
  }
}

resource "aws_iam_role" "apply" {
  name               = "gh-actions-apply"
  assume_role_policy = data.aws_iam_policy_document.apply_trust.json
}

# Everything except IAM (and Organizations/Account)...
resource "aws_iam_role_policy_attachment" "apply_power_user" {
  role       = aws_iam_role.apply.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

data "aws_iam_policy_document" "apply" {
  # ...plus IAM for the prod stack's own instance roles only.
  statement {
    sid     = "ProdInstanceRoles"
    actions = ["iam:*"]
    resources = [
      "arn:aws:iam::${local.account_id}:role/${var.project}-prod-*",
      "arn:aws:iam::${local.account_id}:instance-profile/${var.project}-prod-*",
    ]
  }

  statement {
    sid       = "ReadManagedPolicies"
    actions   = ["iam:GetPolicy", "iam:GetPolicyVersion", "iam:ListPolicyVersions"]
    resources = ["arn:aws:iam::aws:policy/*"]
  }

  # Guard rails: prod never deletes these buckets or the backups.
  statement {
    sid       = "KeepBuckets"
    effect    = "Deny"
    actions   = ["s3:DeleteBucket", "s3:DeleteBucketPolicy", "s3:PutBucketPolicy", "s3:PutLifecycleConfiguration"]
    resources = [aws_s3_bucket.state.arn, module.artifacts.bucket_arn]
  }

  statement {
    sid       = "KeepBackups"
    effect    = "Deny"
    actions   = ["s3:DeleteObject", "s3:DeleteObjectVersion"]
    resources = ["${module.artifacts.bucket_arn}/backups/*"]
  }
}

resource "aws_iam_role_policy" "apply" {
  name   = "apply"
  role   = aws_iam_role.apply.id
  policy = data.aws_iam_policy_document.apply.json
}
