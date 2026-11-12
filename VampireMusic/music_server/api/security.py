from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time

from typing import Any
from urllib.parse import parse_qsl

from fastapi import HTTPException, Request, status

from VampireMusic import db

from .settings import (
    get_bot_token,
    get_jwt_secret,
    settings,
)


def _b64encode(value: bytes) -> str:
    return (
        base64.urlsafe_b64encode(value)
        .rstrip(b"=")
        .decode("ascii")
    )


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)

    return base64.urlsafe_b64decode(
        value + padding
    )


def _json_encode(value: dict[str, Any]) -> str:
    raw = json.dumps(
        value,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")

    return _b64encode(raw)


def _json_decode(value: str) -> dict[str, Any]:
    decoded = json.loads(
        _b64decode(value)
    )

    if not isinstance(decoded, dict):
        raise ValueError("Invalid token payload.")

    return decoded


def verify_telegram_init_data(
    init_data: str,
    *,
    max_age: int | None = None,
) -> dict[str, Any] | None:
    """
    Validate Telegram Mini App initData.

    HMAC data-check string contains every received field except `hash`.
    The `signature` field is retained in this HMAC validation because
    it is part of the received parameters.
    """
    if not isinstance(init_data, str):
        return None

    if not init_data or len(init_data) > 8192:
        return None

    try:
        pairs = parse_qsl(
            init_data,
            keep_blank_values=True,
            strict_parsing=True,
        )

        values: dict[str, str] = {}

        for key, value in pairs:
            if key in values:
                return None

            values[key] = value

        received_hash = values.pop("hash", None)

        if not received_hash or len(received_hash) != 64:
            return None

        auth_date = int(
            values.get("auth_date", "0")
        )

        now = int(time.time())

        if auth_date <= 0 or auth_date > now + 60:
            return None

        allowed_age = (
            max_age
            if max_age is not None
            else settings.auth_max_age
        )

        if now - auth_date > allowed_age:
            return None

        data_check_string = "\n".join(
            f"{key}={value}"
            for key, value in sorted(values.items())
        )

        # Telegram HMAC:
        # secret_key = HMAC_SHA256(key="WebAppData", message=bot_token)
        secret_key = hmac.new(
            b"WebAppData",
            get_bot_token().encode("utf-8"),
            hashlib.sha256,
        ).digest()

        calculated_hash = hmac.new(
            secret_key,
            data_check_string.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(
            calculated_hash,
            received_hash.lower(),
        ):
            return None

        user_data = json.loads(
            values.get("user", "{}")
        )

        if not isinstance(user_data, dict):
            return None

        user_id = int(
            user_data.get("id", 0)
        )

        if user_id <= 0:
            return None

        return {
            "id": user_id,
            "first_name": str(
                user_data.get("first_name") or ""
            )[:64],
            "last_name": str(
                user_data.get("last_name") or ""
            )[:64],
            "username": (
                str(user_data["username"])[:64]
                if user_data.get("username")
                else None
            ),
            "language_code": (
                str(user_data["language_code"])[:16]
                if user_data.get("language_code")
                else None
            ),
            "photo_url": (
                str(user_data["photo_url"])[:2048]
                if user_data.get("photo_url")
                else None
            ),
            "auth_date": auth_date,
        }

    except (
        ValueError,
        TypeError,
        KeyError,
        json.JSONDecodeError,
    ):
        return None

    except Exception:
        return None


def create_access_token(
    user: dict[str, Any],
) -> str:
    now = int(time.time())

    header = {
        "alg": "HS256",
        "typ": "JWT",
    }

    payload = {
        "sub": str(int(user["id"])),
        "first_name": str(
            user.get("first_name") or ""
        )[:64],
        "username": user.get("username"),
        "iat": now,
        "exp": now + settings.access_token_ttl,
        "type": "access",
    }

    encoded_header = _json_encode(header)
    encoded_payload = _json_encode(payload)

    signing_input = (
        f"{encoded_header}.{encoded_payload}"
    )

    signature = hmac.new(
        get_jwt_secret(),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()

    return (
        f"{signing_input}.{_b64encode(signature)}"
    )


def decode_access_token(
    token: str,
) -> dict[str, Any] | None:
    if not isinstance(token, str) or len(token) > 4096:
        return None

    try:
        parts = token.split(".")

        if len(parts) != 3:
            return None

        encoded_header, encoded_payload, signature = parts

        header = _json_decode(
            encoded_header
        )

        payload = _json_decode(
            encoded_payload
        )

        if header.get("alg") != "HS256":
            return None

        if header.get("typ") != "JWT":
            return None

        signing_input = (
            f"{encoded_header}.{encoded_payload}"
        )

        expected = hmac.new(
            get_jwt_secret(),
            signing_input.encode("ascii"),
            hashlib.sha256,
        ).digest()

        if not hmac.compare_digest(
            expected,
            _b64decode(signature),
        ):
            return None

        now = int(time.time())

        if payload.get("type") != "access":
            return None

        if int(payload.get("exp", 0)) <= now:
            return None

        user_id = int(
            payload.get("sub", 0)
        )

        if user_id <= 0:
            return None

        return {
            "id": user_id,
            "first_name": str(
                payload.get("first_name") or ""
            ),
            "username": payload.get("username"),
        }

    except Exception:
        return None


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()


async def issue_session(
    user: dict[str, Any],
) -> dict[str, Any]:
    refresh_token = new_refresh_token()
    refresh_hash = hash_refresh_token(
        refresh_token,
    )

    now = int(time.time())
    expires_at = now + settings.refresh_token_ttl

    await db.db.music_sessions.insert_one({
        "_id": refresh_hash,
        "user_id": int(user["id"]),
        "created_at": now,
        "expires_at": expires_at,
        "revoked": False,
    })

    return {
        "access_token": create_access_token(user),
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": settings.access_token_ttl,
        "refresh_expires_in": settings.refresh_token_ttl,
    }


async def rotate_refresh_token(
    refresh_token: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if not refresh_token or len(refresh_token) > 256:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_refresh_token",
        )

    digest = hash_refresh_token(
        refresh_token,
    )

    now = int(time.time())

    session = await db.db.music_sessions.find_one({
        "_id": digest,
        "revoked": False,
        "expires_at": {"$gt": now},
    })

    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="refresh_session_expired",
        )

    user_id = int(session["user_id"])

    profile = await db.db.music_profiles.find_one({
        "_id": user_id,
    })

    if profile and profile.get("banned"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="account_unavailable",
        )

    user = {
        "id": user_id,
        "first_name": str(
            profile.get("display_name", "Listener")
            if profile
            else "Listener"
        ),
        "username": (
            profile.get("telegram_username")
            if profile
            else None
        ),
    }

    # Atomic single-use refresh token rotation.
    result = await db.db.music_sessions.update_one(
        {
            "_id": digest,
            "revoked": False,
            "expires_at": {"$gt": now},
        },
        {
            "$set": {
                "revoked": True,
                "revoked_at": now,
            }
        },
    )

    if not result.modified_count:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="refresh_token_already_used",
        )

    tokens = await issue_session(user)

    return user, tokens


async def get_current_user(
    request: Request,
) -> dict[str, Any]:
    authorization = request.headers.get(
        "Authorization",
        "",
    )

    user: dict[str, Any] | None = None

    if authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()

        user = decode_access_token(token)

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid_or_expired_access_token",
            )

    else:
        init_data = request.headers.get(
            "X-Telegram-Init-Data",
            "",
        )

        user = verify_telegram_init_data(
            init_data,
        )

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="telegram_authentication_required",
            )

    try:
        profile = await db.db.music_profiles.find_one({
            "_id": int(user["id"]),
        })

        if profile and profile.get("banned"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="account_unavailable",
            )

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="account_storage_unavailable",
        ) from exc

    return user


async def require_owner(
    user: dict[str, Any],
) -> dict[str, Any]:
    from VampireMusic import config

    if int(user["id"]) != int(config.OWNER_ID):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="owner_only",
        )

    return user


def verify_signed_stream_token(
    video_id: str,
    token: str,
) -> int | None:
    """
    Verify both:
      - 15-minute Mini App stream tokens
      - Existing 45-minute internal voice-chat stream tokens

    The existing core/calls.py uses the same bot-token HMAC format.
    """
    try:
        user_text, expires_text, received_signature = token.split(
            ".",
            2,
        )

        user_id = int(user_text)
        expires = int(expires_text)
        now = int(time.time())

        if user_id <= 0 or expires <= now:
            return None

        # Existing TgCall._internal_stream_url() uses 45 minutes.
        if expires > now + 6 * 60 * 60:
            return None

        payload = (
            f"{user_id}:{video_id}:{expires}"
        )

        expected = hmac.new(
            get_bot_token().encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(
            expected,
            received_signature,
        ):
            return None

        return user_id

    except (ValueError, TypeError):
        return None


def create_signed_stream_token(
    user_id: int,
    video_id: str,
    expires: int,
) -> str:
    payload = (
        f"{int(user_id)}:{video_id}:{int(expires)}"
    )

    signature = hmac.new(
        get_bot_token().encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return (
        f"{int(user_id)}."
        f"{int(expires)}."
        f"{signature}"
    )