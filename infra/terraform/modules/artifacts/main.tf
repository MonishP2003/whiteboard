variable "bucket_name" {
  type = string
}

variable "backup_retention_days" {
  type    = number
  default = 14
}

# Holds deploy/<service>/ (files deploy.yml syncs to each instance) and backups/
# (nightly pg_dump). Managed by the bootstrap stack so `terraform destroy` of
# envs/prod never takes the backups with it; see README.md.
resource "aws_s3_bucket" "artifacts" {
  bucket        = var.bucket_name
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    id     = "expire-backups"
    status = "Enabled"
    filter {
      prefix = "backups/"
    }
    expiration {
      days = var.backup_retention_days
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

output "bucket" {
  value = aws_s3_bucket.artifacts.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.artifacts.arn
}
