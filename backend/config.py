"""Runtime configuration for the LectureLens AI backend.

Everything is read from environment variables so no secret is ever committed.
See ``.env.example`` for the full list.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping

DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_MAX_FILE_MB = 5
DEFAULT_MAX_TEXT_LENGTH = 60_000
ALLOWED_FILE_TYPES = ("txt", "pdf", "docx")


def _positive_int(env: Mapping[str, str], name: str, default: int) -> int:
    raw = env.get(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


@dataclass(frozen=True)
class Config:
    """Application configuration resolved from the environment."""

    openai_api_key: str | None = None
    openai_model: str = DEFAULT_MODEL
    max_file_mb: int = DEFAULT_MAX_FILE_MB
    max_text_length: int = DEFAULT_MAX_TEXT_LENGTH

    @property
    def live_ai_configured(self) -> bool:
        """True only when a non-empty API key is present."""
        return bool(self.openai_api_key and self.openai_api_key.strip())

    @property
    def max_file_bytes(self) -> int:
        return self.max_file_mb * 1024 * 1024

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "Config":
        env = os.environ if env is None else env
        key = (env.get("OPENAI_API_KEY") or "").strip() or None
        model = (env.get("OPENAI_MODEL") or "").strip() or DEFAULT_MODEL
        return cls(
            openai_api_key=key,
            openai_model=model,
            max_file_mb=_positive_int(env, "MAX_FILE_MB", DEFAULT_MAX_FILE_MB),
            max_text_length=_positive_int(env, "MAX_TEXT_LENGTH", DEFAULT_MAX_TEXT_LENGTH),
        )
