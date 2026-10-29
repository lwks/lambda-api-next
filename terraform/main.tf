data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "candidate_cvs" {
  bucket        = var.bucket_name
  bucket_prefix = var.bucket_name == null ? var.bucket_prefix : null

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name        = "lambda-api-next-candidate-cvs"
    ManagedBy   = "Terraform"
    DataClass   = "CandidateCV"
    Environment = "production"
  }
}

resource "aws_s3_bucket_ownership_controls" "candidate_cvs" {
  bucket = aws_s3_bucket.candidate_cvs.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "candidate_cvs" {
  bucket = aws_s3_bucket.candidate_cvs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "candidate_cvs" {
  bucket = aws_s3_bucket.candidate_cvs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "candidate_cvs" {
  bucket = aws_s3_bucket.candidate_cvs.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "candidate_cvs" {
  bucket = aws_s3_bucket.candidate_cvs.id

  rule {
    id     = "cleanup-old-cv-versions"
    status = "Enabled"

    filter {
      prefix = ""
    }

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_expiration_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    sid     = "LambdaAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "candidate_cv_lambda" {
  name               = "lambda-api-next-candidate-cv"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = {
    ManagedBy = "Terraform"
  }
}

resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.candidate_cv_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "candidate_cv_access" {
  statement {
    sid       = "ListCandidateCVBucket"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.candidate_cvs.arn]
  }

  statement {
    sid    = "ManageCandidateCVObjects"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject"
    ]
    resources = ["${aws_s3_bucket.candidate_cvs.arn}/*"]
  }
}

resource "aws_iam_role_policy" "candidate_cv_access" {
  name   = "candidate-cv-s3-access"
  role   = aws_iam_role.candidate_cv_lambda.id
  policy = data.aws_iam_policy_document.candidate_cv_access.json
}
