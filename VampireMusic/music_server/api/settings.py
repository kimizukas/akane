from __future__ import annotations

import os

from dataclasses import dataclass
from pathlib import Path

from VampireMusic import config


@dataclass(frozen=True, slots=True)
class APISettings:
    host: str
    port: int
    auth_max_age: int
    access_token_ttl: int
    refresh_token_ttl: int
    max_upload_size: int
    max_json_size: int
    upload_cooldown: int
    upload_directory: Path
    gemini_timeout: float
    gemini_model: str
    gemini_api_key: str
    cors_origins: tuple[str, ...]
    debug: bool

    @classmethod
    def load(cls) -> "APISettings":
        base_dir = Path(__file__).resolve().parents[1]

        raw_upload_dir = os.getenv(
            "MUSIC_UPLOAD_DIR",
            "",
        ).strip()

        # Never use the repository root as an upload/static directory.
        upload_dir = (
            Path(raw_upload_dir).expanduser()
            if raw_upload_dir
            else base_dir / "uploads"
        ).resolve()

        origins = tuple(
            item.strip().rstrip("/")
            for item in os.getenv(
                "MUSIC_CORS_ORIGINS",
                "",
            ).split(",")
            if item.strip()
        )

        return cls(
            host=os.getenv(
                "MUSIC_API_HOST",
                "127.0.0.1",
            ).strip() or "127.0.0.1",

            port=int(
                os.getenv(
                    "MUSIC_API_PORT",
                    "8088",
                )
            ),

            auth_max_age=max(
                60,
                min(
                    int(
                        os.getenv(
                            "TELEGRAM_AUTH_MAX_AGE",
                            "3600",
                        )
                    ),
                    86400,
                ),
            ),

            access_token_ttl=max(
                60,
                min(
                    int(
                        os.getenv(
                            "MUSIC_ACCESS_TOKEN_TTL",
                            "900",
                        )
                    ),
                    3600,
                ),
            ),

            refresh_token_ttl=max(
                3600,
                min(
                    int(
                        os.getenv(
                            "MUSIC_REFRESH_TOKEN_TTL",
                            "2592000",
                        )
                    ),
                    7776000,
                ),
            ),

            max_upload_size=max(
                1024 * 1024,
                min(
                    int(
                        os.getenv(
                            "MUSIC_MAX_UPLOAD_SIZE",
                            "5242880",
                        )
                    ),
                    20 * 1024 * 1024,
                ),
            ),

            max_json_size=1024 * 1024,

            upload_cooldown=max(
                1,
                int(
                    os.getenv(
                        "MUSIC_UPLOAD_COOLDOWN",
                        "8",
                    )
                ),
            ),

            upload_directory=upload_dir,

            gemini_timeout=12.0,

            gemini_model=os.getenv(
                "GEMINI_MODEL",
                "gemini-2.5-flash",
            ).strip(),

            gemini_api_key=os.getenv(
                "GEMINI_API_KEY",
                "",
            ).strip(),

            cors_origins=origins,

            debug=(
                os.getenv(
                    "MUSIC_API_DEBUG",
                    "false",
                ).lower() == "true"
            ),
        )


settings = APISettings.load()


def get_bot_token() -> str:
    token = str(
        getattr(config, "BOT_TOKEN", "") or ""
    ).strip()

    if not token:
        raise RuntimeError(
            "BOT_TOKEN is not configured."
        )

    return token


def get_jwt_secret() -> bytes:
    """
    A dedicated MINIAPP_JWT_SECRET is recommended.

    When it is absent, derive a separate key from BOT_TOKEN so the
    backend can still initialise without adding another mandatory
    environment variable.
    """
    import hashlib
    import hmac

    explicit = os.getenv(
        "MINIAPP_JWT_SECRET",
        "",
    ).strip()

    if explicit:
        if len(explicit) < 32:
            raise RuntimeError(
                "MINIAPP_JWT_SECRET must contain at least 32 characters."
            )

        return explicit.encode("utf-8")

    return hmac.new(
        get_bot_token().encode("utf-8"),
        b"taalune-miniapp-access-token-v1",
        hashlib.sha256,
    ).digest()