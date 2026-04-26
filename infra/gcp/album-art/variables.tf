variable "project_id" {
  description = "Google Cloud project ID."
  type        = string
}

variable "region" {
  description = "Default Google Cloud region for provider operations."
  type        = string
  default     = "asia-southeast1"
}

variable "bucket_name" {
  description = "Cloud Storage bucket name used for album art."
  type        = string
  default     = "dj-assist-album-art"
}

variable "bucket_location" {
  description = "Cloud Storage bucket location."
  type        = string
  default     = "asia-southeast1"
}

variable "bucket_storage_class" {
  description = "Cloud Storage bucket storage class."
  type        = string
  default     = "STANDARD"
}

variable "public_access_enabled" {
  description = "Whether album-art objects should be publicly readable."
  type        = bool
  default     = true
}

variable "public_access_prevention" {
  description = "Bucket public access prevention mode. Use \"unspecified\" for public buckets."
  type        = string
  default     = "unspecified"
}

variable "service_account_id" {
  description = "Service account ID for the album-art uploader."
  type        = string
  default     = "dj-assist-art-uploader"
}

variable "service_account_display_name" {
  description = "Display name for the uploader service account."
  type        = string
  default     = "DJ Assist Album Art Uploader"
}

variable "create_service_account_key" {
  description = "Whether Terraform should also create a JSON key for the uploader service account. This stores the private key in Terraform state."
  type        = bool
  default     = false
}

variable "bucket_prefix" {
  description = "Default object prefix used by the local album-art backfill command."
  type        = string
  default     = "album-art"
}

