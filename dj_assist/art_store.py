from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import base64
import mimetypes
import os
from pathlib import Path
from urllib.parse import unquote, urlparse

import requests


DEFAULT_GCS_PREFIX = "album-art"
DEFAULT_CACHE_CONTROL = "public, max-age=31536000, immutable"
_DOWNLOAD_TIMEOUT = float(os.getenv("DJ_ASSIST_ART_DOWNLOAD_TIMEOUT", "12"))
_MAX_IMAGE_BYTES = int(float(os.getenv("DJ_ASSIST_ART_MAX_BYTES", str(12 * 1024 * 1024))))


@dataclass
class DownloadedArt:
    data: bytes
    content_type: str
    source_url: str
    extension: str
    sha256_hex: str


@dataclass
class StoredArt:
    public_url: str
    object_name: str
    sha256_hex: str
    content_type: str


def gcs_bucket_from_env() -> str:
    return str(
        os.getenv("DJ_ASSIST_GCS_BUCKET")
        or os.getenv("GCS_BUCKET")
        or os.getenv("GOOGLE_CLOUD_STORAGE_BUCKET")
        or ""
    ).strip()


def gcs_prefix_from_env() -> str:
    return str(os.getenv("DJ_ASSIST_GCS_PREFIX") or DEFAULT_GCS_PREFIX).strip().strip("/")


def gcs_public_base_url(bucket: str, explicit: str | None = None) -> str:
    value = str(explicit or os.getenv("DJ_ASSIST_GCS_PUBLIC_BASE_URL") or "").strip().rstrip("/")
    if value:
        return value
    return f"https://storage.googleapis.com/{bucket}"


def is_managed_art_url(url: str | None, bucket: str, public_base_url: str | None = None) -> bool:
    candidate = str(url or "").strip()
    if not candidate:
        return False
    base = gcs_public_base_url(bucket, explicit=public_base_url)
    return candidate.startswith(f"{base}/") or candidate.startswith(f"gs://{bucket}/")


def object_public_url(bucket: str, object_name: str, explicit_base_url: str | None = None) -> str:
    return f"{gcs_public_base_url(bucket, explicit=explicit_base_url)}/{object_name.lstrip('/')}"


def _content_type_extension(content_type: str | None, source_url: str) -> str:
    normalized = str(content_type or "").split(";", 1)[0].strip().lower()
    extension = mimetypes.guess_extension(normalized or "") or ""
    if extension == ".jpe":
        extension = ".jpg"
    if extension:
        return extension

    parsed = urlparse(source_url)
    path_suffix = Path(unquote(parsed.path)).suffix.lower()
    if path_suffix in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        return ".jpg" if path_suffix == ".jpeg" else path_suffix
    return ".bin"


def _parse_data_uri(source_url: str) -> DownloadedArt:
    header, _, payload = source_url.partition(",")
    if not header.startswith("data:") or not payload:
        raise ValueError("invalid data URI")
    metadata = header[5:]
    parts = metadata.split(";")
    content_type = (parts[0] or "application/octet-stream").strip().lower()
    is_base64 = any(part.strip().lower() == "base64" for part in parts[1:])
    if is_base64:
        data = base64.b64decode(payload)
    else:
        data = unquote(payload).encode("utf-8")
    if len(data) > _MAX_IMAGE_BYTES:
        raise ValueError(f"image exceeds {_MAX_IMAGE_BYTES} bytes")
    if not content_type.startswith("image/"):
        raise ValueError(f"unsupported content type: {content_type}")
    return DownloadedArt(
        data=data,
        content_type=content_type,
        source_url=source_url,
        extension=_content_type_extension(content_type, source_url),
        sha256_hex=sha256(data).hexdigest(),
    )


def download_art(source_url: str) -> DownloadedArt:
    candidate = str(source_url or "").strip()
    if not candidate:
        raise ValueError("album art URL is empty")
    if candidate.startswith("data:"):
        return _parse_data_uri(candidate)

    response = requests.get(candidate, timeout=_DOWNLOAD_TIMEOUT)
    response.raise_for_status()
    content_type = str(response.headers.get("content-type") or "application/octet-stream").split(";", 1)[0].strip().lower()
    if not content_type.startswith("image/"):
        raise ValueError(f"unsupported content type: {content_type}")
    data = response.content
    if not data:
        raise ValueError("empty image response")
    if len(data) > _MAX_IMAGE_BYTES:
        raise ValueError(f"image exceeds {_MAX_IMAGE_BYTES} bytes")
    return DownloadedArt(
        data=data,
        content_type=content_type,
        source_url=candidate,
        extension=_content_type_extension(content_type, candidate),
        sha256_hex=sha256(data).hexdigest(),
    )


def upload_art_to_gcs(
    downloaded: DownloadedArt,
    *,
    bucket_name: str,
    prefix: str | None = None,
    public_base_url: str | None = None,
) -> StoredArt:
    try:
        from google.cloud import storage
    except ImportError as exc:
        raise RuntimeError("google-cloud-storage is required for GCS album-art uploads") from exc

    resolved_prefix = (prefix or DEFAULT_GCS_PREFIX).strip().strip("/")
    object_name = f"{resolved_prefix}/{downloaded.sha256_hex}{downloaded.extension}" if resolved_prefix else f"{downloaded.sha256_hex}{downloaded.extension}"
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(object_name)
    if not blob.exists(client):
        blob.cache_control = DEFAULT_CACHE_CONTROL
        blob.content_type = downloaded.content_type
        blob.upload_from_string(downloaded.data, content_type=downloaded.content_type)
    return StoredArt(
        public_url=object_public_url(bucket_name, object_name, explicit_base_url=public_base_url),
        object_name=object_name,
        sha256_hex=downloaded.sha256_hex,
        content_type=downloaded.content_type,
    )
