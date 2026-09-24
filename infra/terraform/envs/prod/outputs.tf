output "cloudfront_url" {
  value = "https://${module.cdn.distribution_domain}"
}

output "api_instance_id" {
  value = module.api_server.instance_id
}

output "api_instance_public_dns" {
  value = module.api_server.public_dns
}

output "frontend_instance_id" {
  value = module.frontend_server.instance_id
}

output "frontend_instance_public_dns" {
  value = module.frontend_server.public_dns
}

# Copy these into GitHub → Settings → Secrets and variables → Actions → Variables.
# AWS_DEPLOY_ROLE_ARN comes from the bootstrap stack's outputs.
output "github_variables" {
  value = {
    AWS_REGION                  = var.region
    ECR_API_REPOSITORY_URL      = module.registry["api"].repository_url
    ECR_FRONTEND_REPOSITORY_URL = module.registry["frontend"].repository_url
    ARTIFACTS_BUCKET            = data.aws_s3_bucket.artifacts.bucket
    CLOUDFRONT_DOMAIN           = module.cdn.distribution_domain
    API_INSTANCE_ID             = module.api_server.instance_id
    FRONTEND_INSTANCE_ID        = module.frontend_server.instance_id
  }
}

output "alerts_topic_arn" {
  value = module.observability.alerts_topic_arn
}
