variable "state_encryption_passphrase" {
  description = "Protected passphrase used to encrypt OpenTofu state and plan data."
  type        = string
  sensitive   = true
  ephemeral   = true
}

terraform {
  encryption {
    key_provider "pbkdf2" "portal" {
      passphrase               = var.state_encryption_passphrase
      key_length               = 32
      iterations               = 600000
      encrypted_metadata_alias = "mtg-card-analyzer-portal-v1"
    }

    method "aes_gcm" "portal" {
      keys = key_provider.pbkdf2.portal
    }

    state {
      method   = method.aes_gcm.portal
      enforced = true
    }

    plan {
      method   = method.aes_gcm.portal
      enforced = true
    }
  }
}
