variable "name" {
  type = string
}

variable "subnet_id" {
  type = string
}

variable "security_group_id" {
  type = string
}

variable "artifacts_bucket_arn" {
  type = string
}

variable "ssm_parameter_path" {
  description = "SSM path the instance may read, without trailing slash (e.g. /whiteboard/prod). null: no parameter access."
  type        = string
  default     = null
}

variable "artifacts_read_prefixes" {
  description = "Key prefixes in the artifacts bucket the instance may list and read, e.g. deploy/api/."
  type        = list(string)
}

variable "artifacts_write_prefixes" {
  description = "Key prefixes the instance may also write and delete (backups). Empty: read-only."
  type        = list(string)
  default     = []
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "instance_type" {
  type    = string
  default = "t4g.micro"
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

# --- Instance role ------------------------------------------------------------

data "aws_iam_policy_document" "assume_ec2" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "instance" {
  name               = "${var.name}-instance"
  assume_role_policy = data.aws_iam_policy_document.assume_ec2.json

  # Swap roles on a live instance without a gap (the name is part of its identity).
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_iam_role_policy_attachment" "managed" {
  for_each = toset([
    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
    "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
  ])
  role       = aws_iam_role.instance.name
  policy_arn = each.value
}

locals {
  read_parameters      = var.ssm_parameter_path != null
  artifacts_prefixes   = distinct(concat(var.artifacts_read_prefixes, var.artifacts_write_prefixes))
  parameter_arn_prefix = "arn:aws:ssm:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:parameter${coalesce(var.ssm_parameter_path, "/none")}"
}

data "aws_iam_policy_document" "instance" {
  dynamic "statement" {
    for_each = local.read_parameters ? [1] : []
    content {
      sid       = "ReadAppParameters"
      actions   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
      resources = [local.parameter_arn_prefix, "${local.parameter_arn_prefix}/*"]
    }
  }

  dynamic "statement" {
    for_each = local.read_parameters ? [1] : []
    content {
      sid       = "DecryptViaSsm"
      actions   = ["kms:Decrypt"]
      resources = ["*"] # the aws/ssm key; restricted to use through SSM below
      condition {
        test     = "StringEquals"
        variable = "kms:ViaService"
        values   = ["ssm.${data.aws_region.current.region}.amazonaws.com"]
      }
    }
  }

  statement {
    sid       = "ArtifactsList"
    actions   = ["s3:ListBucket"]
    resources = [var.artifacts_bucket_arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = [for p in local.artifacts_prefixes : "${p}*"]
    }
  }

  statement {
    sid       = "ArtifactsRead"
    actions   = ["s3:GetObject"]
    resources = [for p in local.artifacts_prefixes : "${var.artifacts_bucket_arn}/${p}*"]
  }

  dynamic "statement" {
    for_each = length(var.artifacts_write_prefixes) > 0 ? [1] : []
    content {
      sid       = "ArtifactsWrite"
      actions   = ["s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload"]
      resources = [for p in var.artifacts_write_prefixes : "${var.artifacts_bucket_arn}/${p}*"]
    }
  }
}

resource "aws_iam_role_policy" "instance" {
  name   = "app"
  role   = aws_iam_role.instance.id
  policy = data.aws_iam_policy_document.instance.json
}

resource "aws_iam_instance_profile" "instance" {
  name = "${var.name}-instance"
  role = aws_iam_role.instance.name

  lifecycle {
    create_before_destroy = true
  }
}

# --- Instance -----------------------------------------------------------------

resource "aws_instance" "app" {
  ami                         = data.aws_ssm_parameter.al2023_arm64.value
  instance_type               = var.instance_type
  subnet_id                   = var.subnet_id
  vpc_security_group_ids      = [var.security_group_id]
  iam_instance_profile        = aws_iam_instance_profile.instance.name
  associate_public_ip_address = true
  user_data                   = file("${path.module}/user_data.sh")

  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    encrypted   = true
  }

  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1 # containers don't need instance credentials
  }

  tags = merge(var.tags, { Name = var.name })

  lifecycle {
    # Postgres lives on the api instance: a newer AMI must not replace it.
    # Replace deliberately with `terraform apply -replace=...`.
    ignore_changes = [ami]
  }
}

output "instance_id" {
  value = aws_instance.app.id
}

output "public_dns" {
  value = aws_instance.app.public_dns
}
