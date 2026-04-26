# Album Art Backfill

This document covers:

- the Google Cloud assets used for album-art hosting
- the Terraform files that manage those assets
- the local command that backfills existing track artwork into GCS

## What The Backfill Does

The local backfill command:

1. reads tracks already in the DJ Assist database
2. reuses the current album-art resolution logic from the scanner
3. downloads the resolved image
4. uploads it to a GCS bucket
5. rewrites `tracks.album_art_url` to the stored object URL
6. records GCS metadata in `album_art_match_debug`

Code references:

- [dj_assist/cli.py](/Users/pavel/Projects/dj-assist/dj_assist/cli.py:822)
- [dj_assist/art_store.py](/Users/pavel/Projects/dj-assist/dj_assist/art_store.py:1)

## Managed Cloud Assets

Terraform for the created Google Cloud assets lives in:

- [infra/gcp/album-art/main.tf](/Users/pavel/Projects/dj-assist/infra/gcp/album-art/main.tf:1)
- [infra/gcp/album-art/variables.tf](/Users/pavel/Projects/dj-assist/infra/gcp/album-art/variables.tf:1)
- [infra/gcp/album-art/outputs.tf](/Users/pavel/Projects/dj-assist/infra/gcp/album-art/outputs.tf:1)
- [infra/gcp/album-art/versions.tf](/Users/pavel/Projects/dj-assist/infra/gcp/album-art/versions.tf:1)
- [infra/gcp/album-art/terraform.tfvars.example](/Users/pavel/Projects/dj-assist/infra/gcp/album-art/terraform.tfvars.example:1)

This Terraform manages:

- the `dj-assist-album-art` Cloud Storage bucket
- public read access for bucket objects
- the `dj-assist-art-uploader` service account
- bucket write access for that uploader service account
- optionally, a service-account key

## Terraform Setup

### 1. Create a tfvars file

```bash
cd /Users/pavel/Projects/dj-assist/infra/gcp/album-art
cp terraform.tfvars.example terraform.tfvars
```

### 2. Initialize Terraform

```bash
terraform init
```

### 3. Review the plan

```bash
terraform plan
```

### 4. Apply

```bash
terraform apply
```

### 5. Inspect outputs

```bash
terraform output
terraform output service_account_email
terraform output public_base_url
```

## Service Account Key

The Terraform module can create a service-account key, but it is disabled by default because the private key would be stored in Terraform state.

Recommended approach:

1. keep `create_service_account_key = false`
2. create the key manually after `terraform apply`

Manual key creation:

```bash
export GCP_PROJECT_ID="dj-assist-494002"
export SA_NAME="dj-assist-art-uploader"
mkdir -p "$HOME/.config/dj-assist"

gcloud iam service-accounts keys create "$HOME/.config/dj-assist/gcs-art-uploader.json" \
  --iam-account="${SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --project="$GCP_PROJECT_ID"
```

If you intentionally want Terraform to create the key, set:

```hcl
create_service_account_key = true
```

Then retrieve it with:

```bash
terraform output -raw service_account_key_private_key | base64 --decode > "$HOME/.config/dj-assist/gcs-art-uploader.json"
chmod 600 "$HOME/.config/dj-assist/gcs-art-uploader.json"
```

## Local Backfill Prerequisites

### 1. Use the correct Python version

The project expects Python 3.11+.

```bash
cd /Users/pavel/Projects/dj-assist
python3.11 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

### 2. Point the CLI at the populated DJ Assist database

For the current local desktop app setup:

```bash
export DJ_ASSIST_DB_PATH="$HOME/Library/Application Support/dj-assist/dj-assist.db"
```

Verify:

```bash
sqlite3 "$DJ_ASSIST_DB_PATH" 'select count(*) from tracks;'
```

### 3. Export GCS credentials and bucket settings

```bash
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/dj-assist/gcs-art-uploader.json"
export DJ_ASSIST_GCS_BUCKET="dj-assist-album-art"
export DJ_ASSIST_GCS_PREFIX="album-art"
export DJ_ASSIST_GCS_PUBLIC_BASE_URL="https://storage.googleapis.com/dj-assist-album-art"
```

Optional tuning:

```bash
export DJ_ASSIST_ART_DOWNLOAD_TIMEOUT="12"
export DJ_ASSIST_ART_MAX_BYTES="12582912"
```

## Run The Backfill

### Small test run

```bash
python3 -m dj_assist.cli store-art-gcs --limit 20 --verbose
```

### Full run

```bash
python3 -m dj_assist.cli store-art-gcs --verbose
```

### Useful variants

Reprocess tracks even if they already point at the configured bucket:

```bash
python3 -m dj_assist.cli store-art-gcs --force --verbose
```

Force a fresh provider lookup instead of reusing the existing `album_art_url`:

```bash
python3 -m dj_assist.cli store-art-gcs --force-resolve --verbose
```

Override bucket settings explicitly:

```bash
python3 -m dj_assist.cli store-art-gcs \
  --bucket dj-assist-album-art \
  --prefix album-art \
  --public-base-url https://storage.googleapis.com/dj-assist-album-art \
  --limit 20 \
  --verbose
```

## Verify Results

Check that rows now point at GCS-hosted artwork:

```bash
sqlite3 "$DJ_ASSIST_DB_PATH" "
select id, artist, title, substr(album_art_url, 1, 100)
from tracks
where album_art_url like 'https://storage.googleapis.com/dj-assist-album-art/%'
limit 20;
"
```

Check stored debug metadata:

```bash
sqlite3 "$DJ_ASSIST_DB_PATH" "
select id, substr(album_art_match_debug, 1, 300)
from tracks
where album_art_url like 'https://storage.googleapis.com/dj-assist-album-art/%'
limit 5;
"
```

List uploaded objects:

```bash
gcloud storage ls "gs://dj-assist-album-art/album-art/**" | sed -n '1,20p'
```

## Troubleshooting

`No tracks in database`

- confirm `DJ_ASSIST_DB_PATH` points to the populated app database
- verify with `sqlite3 "$DJ_ASSIST_DB_PATH" 'select count(*) from tracks;'`

`google-cloud-storage is required`

- activate the project virtualenv
- run `pip install -r requirements.txt`

`403` from GCS uploads

- confirm `GOOGLE_APPLICATION_CREDENTIALS` points to the uploader service-account key
- confirm the uploader service account has `roles/storage.objectAdmin` on the bucket

Images load in GCS but not in the app

- confirm the bucket is publicly readable
- confirm `DJ_ASSIST_GCS_PUBLIC_BASE_URL` matches the actual public URL pattern used by the bucket

