from __future__ import annotations

from importlib import import_module
from typing import Any

__all__ = [
    "Database",
    "Track",
    "Set",
    "SetTrack",
    "scan_directory",
    "get_recommended_next_tracks",
    "is_compatible_key",
    "main",
    "create_app",
    "run_app",
]


def __getattr__(name: str) -> Any:
    if name in {"Database", "Track", "Set", "SetTrack"}:
      module = import_module(".db", __name__)
      return getattr(module, name)
    if name == "scan_directory":
      module = import_module(".scanner", __name__)
      return getattr(module, name)
    if name in {"get_recommended_next_tracks", "is_compatible_key"}:
      module = import_module(".analyzer", __name__)
      return getattr(module, name)
    if name == "main":
      module = import_module(".cli", __name__)
      return getattr(module, name)
    if name in {"create_app", "run_app"}:
      module = import_module(".web", __name__)
      return getattr(module, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
