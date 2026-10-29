# Candidate CV infrastructure

This Terraform configuration creates:

- A private S3 bucket for candidate CV files.
- Server-side encryption using S3-managed keys (AES256).
- Bucket-owner object ownership and public-access blocking.
- Versioning and cleanup of noncurrent versions after 90 days.
- A Lambda execution role with CloudWatch Logs and least-privilege access to the bucket.

## Usage

From this directory:

```bash
terraform init
terraform fmt -check
terraform validate
terraform plan -var='aws_region=us-east-1'
terraform apply -var='aws_region=us-east-1'
```

For a stable bucket name, pass a globally unique value:

```bash
terraform apply \
  -var='aws_region=us-east-1' \
  -var='bucket_name=my-company-lambda-api-cvs'
```

If `bucket_name` is omitted, Terraform generates a stable name from `bucket_prefix` and stores it in state.

The bucket uses `prevent_destroy` because it contains personal data. Review retention and deletion requirements before changing that setting.

## Lambda integration

The bucket name is available as the `candidate_cv_bucket_name` output. Configure the Lambda with:

```text
CV_BUCKET_NAME=<terraform output candidate_cv_bucket_name>
```

The role output can be used as the Lambda execution role ARN when the Lambda is managed by Terraform.

This configuration does not attach the role to an already-deployed Lambda automatically. If the current Lambda is deployed by another tool, either migrate that Lambda resource to Terraform or grant the existing Lambda execution role the same S3 policy. Do not create two tools that manage the same IAM role or Lambda resource.

## State and credentials

Use a remote, access-controlled Terraform state for shared environments. The identity running Terraform needs permissions to manage S3, IAM, and the Terraform state backend. Keep credentials outside the repository and do not commit `.tfstate` files.
