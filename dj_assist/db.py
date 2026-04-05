from datetime import datetime
from typing import Optional
import os

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, create_engine, func, inspect, text
from sqlalchemy.orm import declarative_base, relationship, sessionmaker, selectinload

Base = declarative_base()


def normalize_database_url(url: str) -> str:
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    return url


class Track(Base):
    __tablename__ = "tracks"

    id = Column(Integer, primary_key=True)
    path = Column(String, unique=True, nullable=False)
    title = Column(String)
    artist = Column(String)
    album = Column(String)
    duration = Column(Float)
    bitrate = Column(Float)
    bpm = Column(Float)
    key = Column(String)
    key_numeric = Column(String)
    spotify_id = Column(String)
    spotify_uri = Column(String)
    spotify_url = Column(String)
    spotify_preview_url = Column(String)
    spotify_tempo = Column(Float)
    spotify_key = Column(String)
    spotify_mode = Column(String)
    album_art_url = Column(String)
    album_art_source = Column(String)
    album_art_confidence = Column(Float)
    album_art_review_status = Column(String)
    album_art_review_notes = Column(String)
    album_group_key = Column(String)
    embedded_album_art = Column(Boolean)
    album_art_match_debug = Column(String)
    spotify_album_name = Column(String)
    spotify_match_score = Column(Float)
    spotify_high_confidence = Column(String)
    youtube_url = Column(String)
    bpm_source = Column(String)
    analysis_status = Column(String)
    analysis_error = Column(String)
    decode_failed = Column(String)
    analysis_stage = Column(String)
    analysis_debug = Column(String)
    file_hash = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    set_tracks = relationship("SetTrack", back_populates="track")

    def __repr__(self):
        return f"<Track {self.artist} - {self.title}>"


class Set(Base):
    __tablename__ = "sets"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    set_tracks = relationship("SetTrack", back_populates="set_set", order_by="SetTrack.position")

    def __repr__(self):
        return f"<Set {self.name}>"

    @property
    def total_duration(self):
        return sum(st.track.duration or 0 for st in self.set_tracks)


class SetTrack(Base):
    __tablename__ = "set_tracks"
    __table_args__ = (UniqueConstraint("set_id", "position"),)

    id = Column(Integer, primary_key=True)
    set_id = Column(Integer, ForeignKey("sets.id"), nullable=False)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=False)
    position = Column(Integer, nullable=False)

    set_set = relationship("Set", back_populates="set_tracks")
    track = relationship("Track", back_populates="set_tracks")


class Database:
    @staticmethod
    def _track_identity(track: Track) -> str:
        return track.spotify_id or track.file_hash or f"{track.artist or ''}|{track.title or ''}|{round(track.duration or 0)}"

    @staticmethod
    def _effective_bpm(track: Track) -> float:
        return float(track.bpm or track.spotify_tempo or 0.0)

    @staticmethod
    def _effective_key(track: Track) -> str:
        value = track.key or track.spotify_key or track.key_numeric or ""
        if value in {"1A", "1B", "Am", "A", "", None}:
            # Avoid treating unknown or stale fallback values as a real harmonic key.
            if not track.key and not track.spotify_key and not track.key_numeric:
                return ""
        return value

    @classmethod
    def _unique_tracks(cls, tracks: list[Track]) -> list[Track]:
        unique = []
        seen = set()
        for track in tracks:
            key = cls._track_identity(track)
            if key in seen:
                continue
            seen.add(key)
            unique.append(track)
        return unique

    @staticmethod
    def _track_score(track: Track) -> int:
        fields = [
            track.path,
            track.title,
            track.artist,
            track.album,
            track.duration,
            track.bitrate,
            track.bpm,
            track.key,
            track.key_numeric,
            track.spotify_id,
            track.spotify_uri,
            track.spotify_url,
            track.spotify_preview_url,
            track.spotify_tempo,
            track.spotify_key,
            track.spotify_mode,
            track.album_art_url,
            track.album_art_source,
            track.album_art_confidence,
            track.album_art_review_status,
            track.album_art_review_notes,
            track.album_group_key,
            track.embedded_album_art,
            track.album_art_match_debug,
            track.spotify_album_name,
            track.spotify_match_score,
            track.spotify_high_confidence,
            track.youtube_url,
            track.bpm_source,
            track.analysis_status,
            track.analysis_error,
            track.decode_failed,
            track.analysis_stage,
            track.analysis_debug,
            track.file_hash,
        ]
        return sum(1 for value in fields if value not in (None, "", 0))

    def __init__(self, db_path: Optional[str] = None):
        database_url = db_path or os.getenv("DATABASE_URL") or os.getenv("DJ_ASSIST_DATABASE_URL")
        if not database_url:
            db_path = os.path.expanduser("~/.dj_assist/dj_assist.db")
            os.makedirs(os.path.dirname(db_path), exist_ok=True)
            database_url = f"sqlite:///{db_path}"
        database_url = normalize_database_url(database_url)
        self.engine = create_engine(database_url, pool_pre_ping=True)
        Base.metadata.create_all(self.engine)
        self._migrate_tracks_table()
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)

    def _migrate_tracks_table(self) -> None:
        inspector = inspect(self.engine)
        if "tracks" not in inspector.get_table_names():
            return

        existing_columns = {column["name"] for column in inspector.get_columns("tracks")}
        desired_columns = {
            "spotify_id": "VARCHAR",
            "spotify_uri": "VARCHAR",
            "spotify_preview_url": "VARCHAR",
            "spotify_tempo": "FLOAT",
            "spotify_key": "VARCHAR",
            "spotify_mode": "VARCHAR",
            "album_art_url": "VARCHAR",
            "album_art_source": "VARCHAR",
            "album_art_confidence": "FLOAT",
            "album_art_review_status": "VARCHAR",
            "album_art_review_notes": "VARCHAR",
            "album_group_key": "VARCHAR",
            "embedded_album_art": "BOOLEAN",
            "album_art_match_debug": "TEXT",
            "spotify_album_name": "VARCHAR",
            "spotify_match_score": "FLOAT",
            "spotify_high_confidence": "VARCHAR",
            "youtube_url": "VARCHAR",
            "bitrate": "FLOAT",
            "bpm_source": "VARCHAR",
            "analysis_status": "VARCHAR",
            "analysis_error": "VARCHAR",
            "decode_failed": "VARCHAR",
            "analysis_stage": "VARCHAR",
            "analysis_debug": "TEXT",
        }

        with self.engine.begin() as conn:
            for column_name, column_type in desired_columns.items():
                if column_name not in existing_columns:
                    conn.execute(text(f"ALTER TABLE tracks ADD COLUMN {column_name} {column_type}"))

    def reset_database(self) -> None:
        Base.metadata.drop_all(self.engine)
        Base.metadata.create_all(self.engine)
        self._migrate_tracks_table()

    def get_session(self):
        return self.Session()

    def add_track(self, track_data: dict) -> Track:
        session = self.get_session()
        try:
            existing = session.query(Track).filter_by(path=track_data["path"]).first()
            if existing:
                for key, value in track_data.items():
                    setattr(existing, key, value)
                session.commit()
                return existing

            duplicate = None
            spotify_id = track_data.get("spotify_id")
            file_hash = track_data.get("file_hash")
            if spotify_id:
                duplicate = session.query(Track).filter(Track.spotify_id == spotify_id).first()
            if not duplicate and file_hash:
                duplicate = session.query(Track).filter(Track.file_hash == file_hash).first()
            if not duplicate:
                title = track_data.get("title")
                artist = track_data.get("artist")
                duration = track_data.get("duration")
                if title and artist and duration is not None:
                    duplicate = (
                        session.query(Track)
                        .filter(Track.title == title, Track.artist == artist, Track.duration.between(duration - 1, duration + 1))
                        .first()
                    )

            if duplicate:
                for key, value in track_data.items():
                    if value not in (None, ""):
                        setattr(duplicate, key, value)
                session.commit()
                return duplicate

            track = Track(**track_data)
            session.add(track)
            session.commit()
            return track
        finally:
            session.close()

    def get_track_by_path(self, path: str) -> Optional[Track]:
        session = self.get_session()
        try:
            return session.query(Track).filter_by(path=path).first()
        finally:
            session.close()

    def get_track_by_id(self, track_id: int) -> Optional[Track]:
        session = self.get_session()
        try:
            return session.query(Track).filter_by(id=track_id).first()
        finally:
            session.close()

    def get_all_tracks(self) -> list[Track]:
        session = self.get_session()
        try:
            tracks = session.query(Track).order_by(Track.artist, Track.title, Track.id).all()
            return self._unique_tracks(tracks)
        finally:
            session.close()

    def get_unique_tracks(self) -> list[Track]:
        session = self.get_session()
        try:
            tracks = session.query(Track).order_by(Track.artist, Track.title, Track.id).all()
            unique = []
            seen = set()
            for track in tracks:
                key = track.spotify_id or track.file_hash or f"{track.artist or ''}|{track.title or ''}|{round(track.duration or 0)}"
                if key in seen:
                    continue
                seen.add(key)
                unique.append(track)
            return unique
        finally:
            session.close()

    def search_tracks(
        self,
        query: Optional[str] = None,
        bpm_min: Optional[float] = None,
        bpm_max: Optional[float] = None,
        key: Optional[str] = None,
        artist: Optional[str] = None,
    ) -> list[Track]:
        session = self.get_session()
        try:
            q = session.query(Track)
            if query:
                q = q.filter(
                    (Track.title.ilike(f"%{query}%")) | 
                    (Track.artist.ilike(f"%{query}%"))
                )
            if bpm_min is not None:
                q = q.filter(func.coalesce(Track.bpm, Track.spotify_tempo) >= bpm_min)
            if bpm_max is not None:
                q = q.filter(func.coalesce(Track.bpm, Track.spotify_tempo) <= bpm_max)
            if key:
                key = key.strip().upper()
                q = q.filter(
                    (func.upper(Track.key) == key)
                    | (func.upper(Track.spotify_key) == key)
                    | (func.upper(Track.key_numeric) == key)
                )
            if artist:
                q = q.filter(Track.artist.ilike(f"%{artist}%"))
            tracks = q.order_by(Track.artist, Track.title, Track.id).all()
            return self._unique_tracks(tracks)
        finally:
            session.close()

    def get_display_bpm(self, track: Track) -> float:
        return self._effective_bpm(track)

    def get_display_key(self, track: Track) -> str:
        return self._effective_key(track)

    def create_set(self, name: str) -> Set:
        session = self.get_session()
        try:
            set_obj = Set(name=name)
            session.add(set_obj)
            session.commit()
            return set_obj
        finally:
            session.close()

    def get_all_sets(self) -> list[Set]:
        session = self.get_session()
        try:
            return (
                session.query(Set)
                .options(selectinload(Set.set_tracks).selectinload(SetTrack.track))
                .all()
            )
        finally:
            session.close()

    def get_set_by_id(self, set_id: int) -> Optional[Set]:
        session = self.get_session()
        try:
            return (
                session.query(Set)
                .options(selectinload(Set.set_tracks).selectinload(SetTrack.track))
                .filter_by(id=set_id)
                .first()
            )
        finally:
            session.close()

    def add_track_to_set(self, set_id: int, track_id: int) -> SetTrack:
        session = self.get_session()
        try:
            max_pos = session.query(SetTrack).filter_by(set_id=set_id).count()
            st = SetTrack(set_id=set_id, track_id=track_id, position=max_pos + 1)
            session.add(st)
            session.commit()
            return st
        finally:
            session.close()

    def remove_track_from_set(self, set_id: int, position: int):
        session = self.get_session()
        try:
            st = session.query(SetTrack).filter_by(set_id=set_id, position=position).first()
            if st:
                session.delete(st)
                session.commit()
                tracks = session.query(SetTrack).filter_by(set_id=set_id).filter(
                    SetTrack.position > position
                ).all()
                for t in tracks:
                    t.position -= 1
                session.commit()
        finally:
            session.close()

    def delete_set(self, set_id: int):
        session = self.get_session()
        try:
            set_obj = session.query(Set).filter_by(id=set_id).first()
            if set_obj:
                session.query(SetTrack).filter_by(set_id=set_id).delete()
                session.delete(set_obj)
                session.commit()
        finally:
            session.close()

    def dedupe_tracks(self, dry_run: bool = False) -> dict:
        session = self.get_session()
        try:
            tracks = session.query(Track).order_by(Track.created_at, Track.id).all()
            grouped: dict[str, list[Track]] = {}
            for track in tracks:
                grouped.setdefault(self._track_identity(track), []).append(track)

            removed = 0
            kept = 0
            groups = 0

            for identity, items in grouped.items():
                if len(items) < 2:
                    continue
                groups += 1
                keeper = sorted(items, key=lambda item: (-self._track_score(item), item.created_at or datetime.utcnow(), item.id))[0]
                duplicates = [track for track in items if track.id != keeper.id]
                kept += 1

                if dry_run:
                    removed += len(duplicates)
                    continue

                duplicate_ids = [track.id for track in duplicates]
                session.query(SetTrack).filter(SetTrack.track_id.in_(duplicate_ids)).update(
                    {SetTrack.track_id: keeper.id},
                    synchronize_session=False,
                )
                for track in duplicates:
                    session.delete(track)
                removed += len(duplicates)

            if not dry_run:
                session.commit()

            return {
                "groups": groups,
                "kept": kept,
                "removed": removed,
                "dry_run": dry_run,
            }
        finally:
            session.close()
