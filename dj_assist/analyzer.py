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
    key: str
    key_numeric: str
    confidence: float


def _load_audio(audio_path: str, duration: int):
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
            "-t",
            str(duration),
            "-ac",
            "1",
            "-ar",
            str(sample_rate),
            "-f",
            "s16le",
            "pipe:1",
        ]
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


def detect_bpm(audio_path: str) -> tuple[float, str, str]:
    try:
        import librosa

        y, sr = _load_audio(audio_path, 180)

        # Estimate tempo on a few windows and keep the consensus.
        windows = []
        if len(y) > sr * 45:
            windows = [y[: sr * 45], y[sr * 30 : sr * 75], y[sr * 60 : sr * 105]]
        else:
            windows = [y]

        candidates: list[float] = []
        for window in windows:
            onset_env = librosa.onset.onset_strength(y=window, sr=sr)

            try:
                tempo = float(librosa.feature.rhythm.tempo(onset_envelope=onset_env, sr=sr)[0])
                if tempo > 0:
                    candidates.append(tempo)
            except Exception:
                pass

            try:
                tempo, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
                tempo = float(tempo)
                if tempo > 0:
                    candidates.append(tempo)
            except Exception:
                pass

            try:
                tempos = librosa.feature.rhythm.tempo(onset_envelope=onset_env, sr=sr, aggregate=None)
                for tempo in tempos[:3]:
                    tempo = float(tempo)
                    if tempo > 0:
                        candidates.append(tempo)
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
                            candidates.append(float(tempo))
            except Exception:
                pass

        if not candidates:
            return 0.0, "analysis", "no tempo candidates"

        # Drop obvious half/double-time outliers by normalizing into a DJ range first.
        normalized = []
        for tempo in candidates:
            while tempo < 60:
                tempo *= 2
            while tempo > 180:
                tempo /= 2
            normalized.append(round(float(tempo), 1))

        tempo = sorted(normalized)[len(normalized) // 2]
        while tempo < 60:
            tempo *= 2
        while tempo > 180:
            tempo /= 2
        return round(float(tempo), 1), "analysis", ""
    except Exception:
        return 0.0, "analysis", "decode_failed"


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
        import librosa

        y, sr = _load_audio(audio_path, 60)
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
    except Exception:
        return "", "", 0.0


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
