provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_storage_bucket" "album_art" {
  name                        = var.bucket_name
  project                     = var.project_id
  location                    = var.bucket_location
  storage_class               = var.bucket_storage_class
  uniform_bucket_level_access = true
  public_access_prevention    = var.public_access_prevention
  force_destroy               = false
}

resource "google_storage_bucket_iam_member" "public_read" {
  count  = var.public_access_enabled ? 1 : 0
  bucket = google_storage_bucket.album_art.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

resource "google_service_account" "art_uploader" {
  project      = var.project_id
  account_id   = var.service_account_id
  display_name = var.service_account_display_name
}

resource "google_storage_bucket_iam_member" "uploader_object_admin" {
  bucket = google_storage_bucket.album_art.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.art_uploader.email}"
}

resource "google_service_account_key" "art_uploader" {
  count              = var.create_service_account_key ? 1 : 0
  service_account_id = google_service_account.art_uploader.name
}

