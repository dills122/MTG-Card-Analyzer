output "d1_database_id" {
  description = "D1 database ID to place in site/wrangler.jsonc for SUBMISSIONS_DB."
  value       = cloudflare_d1_database.submissions.id
}

output "d1_database_name" {
  description = "D1 database name used by the SUBMISSIONS_DB binding."
  value       = cloudflare_d1_database.submissions.name
}

output "r2_bucket_name" {
  description = "Private R2 bucket name used by the SUBMISSION_IMAGES binding."
  value       = cloudflare_r2_bucket.submission_images.name
}

output "wrangler_bindings" {
  description = "Non-secret values that must match site/wrangler.jsonc before deployment."
  value = {
    submissions_db = {
      binding       = "SUBMISSIONS_DB"
      database_id   = cloudflare_d1_database.submissions.id
      database_name = cloudflare_d1_database.submissions.name
    }
    submission_images = {
      binding     = "SUBMISSION_IMAGES"
      bucket_name = cloudflare_r2_bucket.submission_images.name
    }
  }
}

output "required_worker_secret_names" {
  description = "Worker secrets deliberately configured outside OpenTofu state."
  value       = ["TURNSTILE_SECRET_KEY"]
}
