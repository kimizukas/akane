from __future__ import annotations

import time

from fastapi import APIRouter, Depends, Header, HTTPException, status

from .dependencies import get_repository
from .repository import MusicRepository
from .schemas import RefreshRequest
from .security import (
    get_current_user,
    issue_session,
    rotate_refresh_token,
    verify_telegram_init_data,
    hash_refresh_token,
)


router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"],
)


@router.post("/session")
async def create_session(
    x_telegram_init_data: str = Header(
        default="",
        alias="X-Telegram-Init-Data",
    ),
    repository: MusicRepository = Depends(get_repository),
):
    user = verify_telegram_init_data(
        x_telegram_init_data,
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="telegram_authentication_required",
        )

    profile = await repository.ensure_profile(user)

    if profile.get("banned"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="account_unavailable",
        )

    tokens = await issue_session(user)

    return {
        "ok": True,
        "user": await repository.get_profile_payload(
            profile,
            int(user["id"]),
        ),
        **tokens,
    }


@router.post("/refresh")
async def refresh_session(
    payload: RefreshRequest,
):
    user, tokens = await rotate_refresh_token(
        payload.refresh_token,
    )

    return {
        "ok": True,
        "user": user,
        **tokens,
    }


@router.post("/logout")
async def logout(
    payload: RefreshRequest,
    user: dict = Depends(get_current_user),
):
    digest = hash_refresh_token(
        payload.refresh_token,
    )

    result = await __import__(
        "VampireMusic"
    ).db.db.music_sessions.update_one(
        {
            "_id": digest,
            "user_id": int(user["id"]),
            "revoked": False,
        },
        {
            "$set": {
                "revoked": True,
                "revoked_at": int(time.time()),
            }
        },
    )

    return {
        "ok": True,
        "revoked": bool(result.modified_count),
    }