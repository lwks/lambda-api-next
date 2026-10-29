output "candidate_cv_bucket_name" {
  description = "S3 bucket name for candidate CVs."
  value       = aws_s3_bucket.candidate_cvs.bucket
}

output "candidate_cv_bucket_arn" {
  description = "S3 bucket ARN for candidate CVs."
  value       = aws_s3_bucket.candidate_cvs.arn
}

output "candidate_cv_lambda_role_name" {
  description = "IAM role name with CloudWatch and candidate CV S3 permissions."
  value       = aws_iam_role.candidate_cv_lambda.name
}

output "candidate_cv_lambda_role_arn" {
  description = "IAM role ARN with CloudWatch and candidate CV S3 permissions."
  value       = aws_iam_role.candidate_cv_lambda.arn
}
