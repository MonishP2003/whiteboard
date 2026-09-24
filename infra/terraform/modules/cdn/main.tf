variable "name" {
  type = string
}

variable "frontend_origin_domain" {
  description = "Public DNS name of the frontend instance (CloudFront origins must be DNS names)."
  type        = string
}

variable "api_origin_domain" {
  description = "Public DNS name of the api instance."
  type        = string
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

# CSP is left out for now: Razorpay Checkout and Chart.js need a hand-tuned policy.
# The API adds its own headers too (@fastify/helmet); override keeps them consistent.
resource "aws_cloudfront_response_headers_policy" "security" {
  name = "${var.name}-security-headers"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      override                   = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }
}

locals {
  frontend_origin_id = "frontend"
  api_origin_id      = "api"
}

# One distribution in front of both instances: the browser sees a single HTTPS
# origin, so auth cookies work without CORS or a separate API domain.
resource "aws_cloudfront_distribution" "this" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = var.name
  price_class     = "PriceClass_200" # includes India edge locations

  origin {
    origin_id   = local.frontend_origin_id
    domain_name = var.frontend_origin_domain
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  origin {
    origin_id   = local.api_origin_id
    domain_name = var.api_origin_domain
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # SPA routing (unknown paths -> index.html) happens in the frontend's Caddy,
  # so /api/* 404s stay JSON. Caddy's Cache-Control headers drive the TTLs.
  default_cache_behavior {
    target_origin_id           = local.frontend_origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
    compress                   = true
  }

  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = local.api_origin_id
    viewer_protocol_policy     = "https-only" # a redirect would silently turn POSTs into GETs
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
    compress                   = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

output "distribution_id" {
  value = aws_cloudfront_distribution.this.id
}

output "distribution_domain" {
  value = aws_cloudfront_distribution.this.domain_name
}
