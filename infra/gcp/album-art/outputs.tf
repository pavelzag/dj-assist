output "bucket_name" {
  description = "Album-art bucket name."
  value       = google_storage_bucket.album_art.name
}

output "bucket_url" {
  description = "Album-art bucket URL."
  value       = google_storage_bucket.album_art.url
}

output "public_base_url" {
  description = "Public base URL used by the album-art backfill script."
  value       = "https://storage.googleapis.com/${google_storage_bucket.album_art.name}"
}

output "bucket_prefix" {
  description = "Recommended object prefix for the backfill script."
  value       = var.bucket_prefix
}

output "service_account_email" {
  description = "Uploader service account email."
  value       = google_service_account.art_uploader.email
}

output "service_account_key_private_key" {
  description = "Base64-encoded JSON private key for the uploader service account when create_service_account_key is enabled."
  value       = var.create_service_account_key ? google_service_account_key.art_uploader[0].private_key : null
  sensitive   = true
}

