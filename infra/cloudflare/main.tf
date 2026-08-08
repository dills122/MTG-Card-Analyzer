resource "cloudflare_d1_database" "submissions" {
  account_id            = var.cloudflare_account_id
  name                  = var.d1_database_name
  primary_location_hint = var.d1_primary_location_hint

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_r2_bucket" "submission_images" {
  account_id    = var.cloudflare_account_id
  name          = var.r2_bucket_name
  location      = var.r2_location
  storage_class = "Standard"

  lifecycle {
    prevent_destroy = true
  }
}
