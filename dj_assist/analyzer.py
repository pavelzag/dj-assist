from __future__ import annotations

from dataclasses import dataclass
import warnings
import subprocess
import os
from shutil import which
from typing import Optional

import numpy as np

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


@dataclass
class TrackAnalysis:
    bpm: float
    bpm_source: str
    bpm_error: str
    bpm_confidence: float
    decode_failed: bool
    key: str
    key_numeric: str
    key_confidence: float


def _load_audio(audio_path: str, duration: int | float | None):
    try:
        import librosa

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            return librosa.load(audio_path, sr=None, duration=duration)
    except ImportError as exc:
        raise RuntimeError("librosa is required for analysis") from exc
    except Exception:
        if which("ffmpeg") is None:
            raise

        sample_rate = 22050
        command = [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            audio_path,
            "-ac",
            "1",
            "-ar",
            str(sample_rate),
            "-f",
            "s16le",
            "pipe:1",
        ]
        if duration is not None:
            command[5:5] = ["-t", str(duration)]
        env = os.environ.copy()
        env.update({"AV_LOG_FORCE_NOCOLOR": "1"})
        raw = subprocess.check_output(command, stderr=subprocess.DEVNULL, env=env)
        if not raw:
            raise RuntimeError("ffmpeg produced no audio")
        y = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
        return y, sample_rate


def has_decoding_error(audio_path: str) -> bool:
    if which("ffmpeg") is None:
        return False
    try:
        env = os.environ.copy()
        env.update({"AV_LOG_FORCE_NOCOLOR": "1"})
        subprocess.check_output(
            ["ffmpeg", "-v", "error", "-i", audio_path, "-t", "1", "-f", "null", "-"],
            stderr=subprocess.DEVNULL,
            env=env,
        )
        return False
    except Exception:
        return True


def _normalize_bpm_candidate(value: float) -> float:
    bpm = float(value)
    while bpm < 70:
        bpm *= 2
    while bpm > 175:
        bpm /= 2
    return round(float(bpm), 1)


def _cluster_bpms(candidates: list[float], tolerance: float = 3.5) -> list[list[float]]:
    if not candidates:
        return []
    clusters: list[list[float]] = []
    for value in sorted(candidates):
        if not clusters:
          clusters.append([value])
          continue
        current = clusters[-1]
        center = sum(current) / len(current)
        if abs(value - center) <= tolerance:
            current.append(value)
        else:
            clusters.append([value])
    return clusters


def _detect_bpm_from_audio(y: np.ndarray, sr: int) -> tuple[float, str, str, float]:
    import librosa

    windows = []
    if len(y) > sr * 45:
        windows = [
            y[: sr * 45],
            y[sr * 30 : sr * 75],
            y[sr * 60 : sr * 105],
            y[sr * 90 : sr * 135],
        ]
    else:
        windows = [y]

    candidates: list[float] = []
    for window in windows:
        onset_env = librosa.onset.onset_strength(y=window, sr=sr)
        if len(onset_env) < 32 or float(np.max(onset_env)) <= 0:
            continue

        try:
            tempo = float(librosa.feature.rhythm.tempo(onset_envelope=onset_env, sr=sr)[0])
            if tempo > 0:
                candidates.append(_normalize_bpm_candidate(tempo))
        except Exception:
            pass

        try:
            tempo, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
            tempo = float(tempo)
            if tempo > 0:
                candidates.append(_normalize_bpm_candidate(tempo))
        except Exception:
            pass

        try:
            tempos = librosa.feature.rhythm.tempo(onset_envelope=onset_env, sr=sr, aggregate=None)
            for tempo in tempos[:4]:
                tempo = float(tempo)
                if tempo > 0:
                    candidates.append(_normalize_bpm_candidate(tempo))
        except Exception:
            pass

        try:
            window_env = onset_env - float(np.mean(onset_env))
            autocorr = np.correlate(window_env, window_env, mode="full")[len(window_env) - 1 :]
            lag_min = max(1, int(sr * 60 / 180))
            lag_max = min(len(autocorr) - 1, int(sr * 60 / 60))
            if lag_max > lag_min:
                lag = int(np.argmax(autocorr[lag_min:lag_max]) + lag_min)
                if lag > 0:
                    tempo = 60.0 * sr / lag
                    if tempo > 0:
                        candidates.append(_normalize_bpm_candidate(tempo))
        except Exception:
            pass

    if not candidates:
        return 0.0, "analysis", "no tempo candidates", 0.0

    clusters = _cluster_bpms(candidates)
    best_cluster = max(clusters, key=lambda cluster: (len(cluster), -np.std(cluster) if len(cluster) > 1 else 0.0))
    if len(best_cluster) < max(3, len(windows)):
        return 0.0, "analysis", "unstable tempo", 0.18

    spread = float(np.std(best_cluster)) if len(best_cluster) > 1 else 0.0
    if spread > 4.0:
        return 0.0, "analysis", "unstable tempo", max(0.0, 0.45 - min(spread, 12.0) / 20.0)

    tempo = round(float(np.median(best_cluster)), 1)
    support_ratio = min(1.0, len(best_cluster) / max(1.0, len(candidates)))
    spread_score = max(0.0, 1.0 - (spread / 4.0))
    candidate_score = min(1.0, len(candidates) / max(4.0, len(windows) * 3.0))
    confidence = round((support_ratio * 0.55) + (spread_score * 0.3) + (candidate_score * 0.15), 3)
    return tempo, "analysis", "", confidence


def detect_bpm(audio_path: str) -> tuple[float, str, str, float]:
    try:
        y, sr = _load_audio(audio_path, 180)
        return _detect_bpm_from_audio(y, sr)
    except Exception:
        return 0.0, "analysis", "decode_failed", 0.0


def read_tag_bpm(audio_path: str) -> float:
    try:
        from mutagen import File as MutagenFile

        audio = MutagenFile(audio_path)
        if not audio or not getattr(audio, "tags", None):
            return 0.0

        tags = audio.tags
        for key in ("TBPM", "bpm"):
            value = tags.get(key)
            if value:
                item = value[0] if isinstance(value, list) else value
                return float(str(item).strip())
    except Exception:
        pass
    return 0.0


def _score_profile(chroma_mean: np.ndarray, profile: np.ndarray) -> tuple[int, float]:
    scores = []
    for i in range(12):
        rotated = np.roll(profile, i)
        corr = np.corrcoef(chroma_mean, rotated)[0, 1]
        if np.isnan(corr):
            corr = -1.0
        scores.append(float(corr))
    best = int(np.argmax(scores))
    return best, scores[best]


def detect_key(audio_path: str) -> tuple[str, str, float]:
    try:
        y, sr = _load_audio(audio_path, 60)
        return _detect_key_from_audio(y, sr)
    except Exception:
        return "", "", 0.0


def _detect_key_from_audio(y: np.ndarray, sr: int) -> tuple[str, str, float]:
    import librosa

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = np.mean(chroma, axis=1)

    major_idx, major_score = _score_profile(chroma_mean, MAJOR_PROFILE)
    minor_idx, minor_score = _score_profile(chroma_mean, MINOR_PROFILE)

    if major_score >= minor_score:
        note = NOTE_NAMES[major_idx]
        camelot = {
            "C": "8B",
            "C#": "3B",
            "D": "10B",
            "D#": "5B",
            "E": "12B",
            "F": "7B",
            "F#": "2B",
            "G": "9B",
            "G#": "4B",
            "A": "11B",
            "A#": "6B",
            "B": "1B",
        }[note]
        return camelot, note, major_score

    note = NOTE_NAMES[minor_idx]
    camelot = {
        "C": "5A",
        "C#": "12A",
        "D": "7A",
        "D#": "2A",
        "E": "9A",
        "F": "4A",
        "F#": "11A",
        "G": "6A",
        "G#": "1A",
        "A": "8A",
        "A#": "3A",
        "B": "10A",
    }[note]
    return camelot, note + "m", minor_score


def analyze_track(audio_path: str) -> TrackAnalysis:
    try:
        y, sr = _load_audio(audio_path, 180)
    except Exception:
        return TrackAnalysis(
            bpm=0.0,
            bpm_source="analysis",
            bpm_error="decode_failed",
            bpm_confidence=0.0,
            decode_failed=True,
            key="",
            key_numeric="",
            key_confidence=0.0,
        )

    bpm, bpm_source, bpm_error, bpm_confidence = _detect_bpm_from_audio(y, sr)
    key_window = y[: sr * 60] if sr and len(y) > sr * 60 else y
    try:
        key, key_numeric, key_confidence = _detect_key_from_audio(key_window, sr)
    except Exception:
        key, key_numeric, key_confidence = "", "", 0.0

    return TrackAnalysis(
        bpm=bpm,
        bpm_source=bpm_source,
        bpm_error=bpm_error,
        bpm_confidence=bpm_confidence,
        decode_failed=False,
        key=key,
        key_numeric=key_numeric,
        key_confidence=key_confidence,
    )


def extract_waveform_peaks(audio_path: str, width: int = 640) -> dict[str, object]:
    try:
        safe_width = max(64, min(int(width), 4096))
        y, sr = _load_audio(audio_path, None)
        if y is None or len(y) == 0:
            raise RuntimeError("empty audio")

        if isinstance(y, np.ndarray) and y.ndim > 1:
            y = np.mean(y, axis=0)

        step = max(1, int(np.ceil(len(y) / safe_width)))
        peaks: list[dict[str, float]] = []
        for i in range(safe_width):
            start = i * step
            end = min(len(y), start + step)
            window = y[start:end]
            if window.size == 0:
                peaks.append({"min": 0.0, "max": 0.0})
                continue
            peaks.append({
                "min": float(np.min(window)),
                "max": float(np.max(window)),
            })

        duration = float(len(y) / float(sr)) if sr else 0.0
        return {
            "duration": duration,
            "sample_rate": int(sr),
            "samples": int(len(y)),
            "width": safe_width,
            "peaks": peaks,
        }
    except Exception as exc:
        raise RuntimeError(f"waveform peak extraction failed: {exc}") from exc


def is_compatible_key(key1: str, key2: str) -> tuple[bool, str]:
    if not key1 or not key2:
        return False, "Unknown"

    try:
        num1, mode1 = int(key1[:-1]), key1[-1]
        num2, mode2 = int(key2[:-1]), key2[-1]
    except Exception:
        return False, "Invalid key"

    if key1 == key2:
        return True, "Perfect match"
    if num1 == num2 and mode1 != mode2:
        return True, "Relative major/minor"
    if mode1 == mode2 and min((num1 - num2) % 12, (num2 - num1) % 12) == 1:
        return True, "Adjacent Camelot"
    return False, "Key clash"


def get_recommended_next_tracks(
    current_key: str,
    current_bpm: float,
    all_tracks: list,
    exclude_ids: Optional[list] = None,
    bpm_tolerance: float = 5.0,
) -> list:
    recommendations = []
    exclude_ids = exclude_ids or []

    for track in all_tracks:
        if track.id in exclude_ids:
            continue
        if not track.bpm or not track.key:
            continue

        compatible, reason = is_compatible_key(current_key, track.key)
        bpm_diff = abs(float(track.bpm) - float(current_bpm))
        if compatible and bpm_diff <= bpm_tolerance * 2:
            score = 100 - bpm_diff
            recommendations.append((track, reason, score))

    recommendations.sort(key=lambda x: x[2], reverse=True)
    return recommendations[:10]
