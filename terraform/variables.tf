variable "aws_region" {
  description = "AWS region where the CV bucket and Lambda role will be created."
  type        = string
  default     = "us-east-1"
}

variable "bucket_name" {
  description = "Optional globally unique S3 bucket name. Leave null to use bucket_prefix."
  type        = string
  default     = null
}

variable "bucket_prefix" {
  description = "Prefix used when Terraform generates the bucket name."
  type        = string
  default     = "lambda-api-next-cv-"
}

variable "noncurrent_version_expiration_days" {
  description = "Number of days before noncurrent CV versions are expired."
  type        = number
  default     = 90
}
