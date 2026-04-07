from __future__ import annotations

from pathlib import Path

from mutagen.id3 import ID3, ID3NoHeaderError, TALB, TCON, TIT2, TKEY, TPE1, TXXX


def write_mp3_metadata(
    file_path: str,
    *,
    artist: str | None = None,
    title: str | None = None,
    album: str | None = None,
    key: str | None = None,
    custom_tags: list[str] | None = None,
) -> None:
    path = Path(file_path).expanduser().resolve()
    if path.suffix.lower() != ".mp3":
        raise ValueError("Only MP3 metadata writing is currently supported.")
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")

    try:
        tags = ID3(path)
    except ID3NoHeaderError:
        tags = ID3()

    def set_text(frame_id: str, frame) -> None:
        tags.delall(frame_id)
        if frame is not None:
            tags.add(frame)

    normalized_artist = (artist or "").strip()
    normalized_title = (title or "").strip()
    normalized_album = (album or "").strip()
    normalized_key = (key or "").strip()
    normalized_tags = [tag.strip() for tag in (custom_tags or []) if tag and tag.strip()]

    set_text("TPE1", TPE1(encoding=3, text=[normalized_artist]) if normalized_artist else None)
    set_text("TIT2", TIT2(encoding=3, text=[normalized_title]) if normalized_title else None)
    set_text("TALB", TALB(encoding=3, text=[normalized_album]) if normalized_album else None)
    set_text("TKEY", TKEY(encoding=3, text=[normalized_key]) if normalized_key else None)
    set_text("TCON", TCON(encoding=3, text=normalized_tags) if normalized_tags else None)
    tags.delall("TXXX:DJ_ASSIST_TAGS")
    if normalized_tags:
        tags.add(TXXX(encoding=3, desc="DJ_ASSIST_TAGS", text=[", ".join(normalized_tags)]))

    tags.save(path)
