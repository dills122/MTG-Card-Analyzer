variable "cloudflare_account_id" {
  description = "Cloudflare account that owns the portal's D1 and R2 resources."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.cloudflare_account_id))
    error_message = "cloudflare_account_id must be a 32-character lowercase hexadecimal ID."
  }
}

variable "d1_database_name" {
  description = "Name of the D1 review-queue database."
  type        = string
  default     = "mtg-card-analyzer-submissions"

  validation {
    condition     = length(trimspace(var.d1_database_name)) > 0
    error_message = "d1_database_name must not be empty."
  }
}

variable "d1_primary_location_hint" {
  description = "Optional best-effort D1 primary location hint."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition = (
      var.d1_primary_location_hint == null ||
      contains(["wnam", "enam", "weur", "eeur", "apac", "oc"], var.d1_primary_location_hint)
    )
    error_message = "d1_primary_location_hint must be null or a supported Cloudflare location."
  }
}

variable "r2_bucket_name" {
  description = "Name of the private R2 bucket containing submitted images."
  type        = string
  default     = "mtg-card-analyzer-submissions"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$", var.r2_bucket_name))
    error_message = "r2_bucket_name must be a valid 3-63 character lowercase R2 bucket name."
  }
}

variable "r2_location" {
  description = "Optional best-effort R2 bucket location hint."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition = (
      var.r2_location == null ||
      contains(["wnam", "enam", "weur", "eeur", "apac", "oc"], var.r2_location)
    )
    error_message = "r2_location must be null or a supported Cloudflare location."
  }
}
