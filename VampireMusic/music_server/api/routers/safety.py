
from __future__ import annotations

import asyncio
import hashlib
import json
import secrets
import time

from datetime import date, datetime, timezone
from enum import Enum
from typing import Any

from bson import ObjectId
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
)

from VampireMusic.music_server.api.dependencies import (
    get_repository,
)
from VampireMusic.music_server.api.repository import (
    MusicRepository,
    utcnow,
)
from VampireMusic.music_server.api.security import (
    get_current_user,
)


router = APIRouter(
    prefix="/api",
    tags=["Safety and Privacy"],
)


# ---------------------------------------------------------
# Limits
# ---------------------------------------------------------

MAX_REPORTS_PER_HOUR = 10
MAX_BLOCKS_PER_USER = 2000
MAX_EXPORT_DOCUMENTS = 5000
MAX_REPORT_TEXT = 1000

_report_lock = asyncio.Lock()
_report_timestamps: dict[int, list[float]] = {}


# ---------------------------------------------------------
# Schemas
# ---------------------------------------------------------

class ReportTarget(str, Enum):
    USER = "user"
    PLAYLIST = "playlist"
    TRACK = "track"


class ReportCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    target_type: ReportTarget

    target_id: str = Field(
        min_length=1,
        max_length=128,
    )

    reason: str = Field(
        min_length=3,
        max_length=80,
    )

    details: str = Field(
        default="",
        max_length=MAX_REPORT_TEXT,
    )


class PrivacyUpdate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )

    visibility: str | None = None

    discoverable: bool | None = None

    show_activity: bool | None = None

    personalized_recommendations: bool | None = None


class DeleteAccountRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    confirmation: str = Field(
        min_length=6,
        max_length=16,
    )

    reason: str = Field(
        default="",
        max_length=500,
    )


# ---------------------------------------------------------
# Helpers
# ---------------------------------------------------------

def _user_id(user: dict[str, Any]) -> int:
    try:
        return int(user["id"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=401,
            detail="invalid_user",
        ) from exc


def _safe_id(value: Any) -> str:
    if isinstance(value, ObjectId):
        return str(value)

    if isinstance(value, (str, int)):
        return str(value)

    return ""


def _serialize(value: Any) -> Any:
    """
    Convert MongoDB values into JSON-safe values.

    Internal MongoDB fields and credentials are not exposed here.
    """
    if isinstance(value, ObjectId):
        return str(value)

    if isinstance(value, (datetime, date)):
        return value.isoformat()

    if isinstance(value, bytes):
        return None

    if isinstance(value, dict):
        result = {}

        for key, item in value.items():
            if str(key).lower() in {
                "password",
                "password_hash",
                "token",
                "access_token",
                "refresh_token",
                "secret",
                "secret_key",
                "api_key",
                "bot_token",
                "session_token",
            }:
                continue

            result[str(key)] = _serialize(item)

        return result

    if isinstance(value, (list, tuple)):
        return [
            _serialize(item)
            for item in value
        ]

    if isinstance(value, (str, int, float, bool)) or value is None:
        return value

    return str(value)


async def _collect(
    collection,
    query: dict[str, Any],
    *,
    projection: dict[str, int] | None = None,
    limit: int = MAX_EXPORT_DOCUMENTS,
) -> list[dict[str, Any]]:
    cursor = collection.find(
        query,
        projection,
    ).limit(limit)

    results = []

    async for document in cursor:
        results.append(_serialize(document))

    return results


async def _report_rate_limit(user_id: int) -> None:
    now = time.monotonic()
    cutoff = now - 3600

    async with _report_lock:
        timestamps = _report_timestamps.get(
            int(user_id),
            [],
        )

        timestamps = [
            timestamp
            for timestamp in timestamps
            if timestamp > cutoff
        ]

        if len(timestamps) >= MAX_REPORTS_PER_HOUR:
            retry_after = max(
                1,
                int(3600 - (now - timestamps[0])),
            )

            _report_timestamps[int(user_id)] = timestamps

            raise HTTPException(
                status_code=429,
                detail={
                    "error": "report_rate_limit",
                    "retry_after": retry_after,
                },
                headers={
                    "Retry-After": str(retry_after),
                },
            )

        timestamps.append(now)

        _report_timestamps[int(user_id)] = timestamps


async def _ensure_safety_indexes(repository: MusicRepository) -> None:
    await repository.profiles.database[
        "music_user_blocks"
    ].create_index(
        [
            ("blocker_id", 1),
            ("blocked_user_id", 1),
        ],
        unique=True,
        name="uniq_music_user_block",
    )

    await repository.profiles.database[
        "music_user_blocks"
    ].create_index(
        [
            ("blocked_user_id", 1),
            ("created_at", -1),
        ],
        name="music_user_blocked_by",
    )

    await repository.profiles.database[
        "music_reports"
    ].create_index(
        [
            ("status", 1),
            ("created_at", -1),
        ],
        name="music_report_review_queue",
    )

    await repository.profiles.database[
        "music_reports"
    ].create_index(
        [
            ("reporter_id", 1),
            ("created_at", -1),
        ],
        name="music_report_by_user",
    )

    await repository.profiles.database[
        "music_account_deletion_requests"
    ].create_index(
        [
            ("user_id", 1),
            ("status", 1),
        ],
        name="music_account_deletion_status",
    )


async def _get_block_collection(repository: MusicRepository):
    await _ensure_safety_indexes(repository)

    return repository.profiles.database[
        "music_user_blocks"
    ]


async def _get_report_collection(repository: MusicRepository):
    await _ensure_safety_indexes(repository)

    return repository.profiles.database[
        "music_reports"
    ]


async def _get_deletion_collection(repository: MusicRepository):
    await _ensure_safety_indexes(repository)

    return repository.profiles.database[
        "music_account_deletion_requests"
    ]


# ---------------------------------------------------------
# Block list
# ---------------------------------------------------------

@router.get("/safety/blocks")
async def list_blocked_users(
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    user_id = _user_id(user)

    collection = await _get_block_collection(repository)

    cursor = collection.find({
        "blocker_id": user_id,
    }).sort(
        "created_at",
        -1,
    ).limit(
        MAX_BLOCKS_PER_USER,
    )

    results = []

    async for block in cursor:
        blocked_id = int(block["blocked_user_id"])

        profile = await repository.profiles.find_one(
            {"_id": blocked_id},
            {
                "handle": 1,
                "display_name": 1,
                "avatar_url": 1,
            },
        )

        if not profile:
            profile = {
                "_id": blocked_id,
                "handle": f"listener_{blocked_id}",
                "display_name": "Unavailable user",
                "avatar_url": None,
            }

        results.append({
            "user_id": blocked_id,
            "handle": profile.get("handle"),
            "display_name": profile.get("display_name"),
            "avatar_url": profile.get("avatar_url"),
            "blocked_at": _serialize(
                block.get("created_at")
            ),
        })

    return {
        "ok": True,
        "count": len(results),
        "results": results,
    }


@router.post("/safety/blocks/{target_user_id}", status_code=201)
async def block_user(
    target_user_id: int,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    user_id = _user_id(user)

    if target_user_id <= 0:
        raise HTTPException(
            status_code=400,
            detail="invalid_target_user",
        )

    if target_user_id == user_id:
        raise HTTPException(
            status_code=400,
            detail="cannot_block_self",
        )

    target = await repository.profiles.find_one({
        "_id": int(target_user_id),
    })

    if not target:
        raise HTTPException(
            status_code=404,
            detail="user_not_found",
        )

    if target.get("banned"):
        raise HTTPException(
            status_code=404,
            detail="user_not_found",
        )

    collection = await _get_block_collection(repository)

    existing = await collection.find_one({
        "blocker_id": user_id,
        "blocked_user_id": int(target_user_id),
    })

    if existing:
        return {
            "ok": True,
            "blocked": True,
            "already_blocked": True,
            "user_id": int(target_user_id),
        }

    count = await collection.count_documents({
        "blocker_id": user_id,
    })

    if count >= MAX_BLOCKS_PER_USER:
        raise HTTPException(
            status_code=409,
            detail="block_limit_reached",
        )

    now = utcnow()

    try:
        await collection.insert_one({
            "_id": secrets.token_urlsafe(18),
            "blocker_id": user_id,
            "blocked_user_id": int(target_user_id),
            "created_at": now,
        })

    except Exception:
        # Handle a concurrent duplicate block request safely.
        existing = await collection.find_one({
            "blocker_id": user_id,
            "blocked_user_id": int(target_user_id),
        })

        if not existing:
            raise

    return {
        "ok": True,
        "blocked": True,
        "user_id": int(target_user_id),
    }


@router.delete("/safety/blocks/{target_user_id}")
async def unblock_user(
    target_user_id: int,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    user_id = _user_id(user)

    collection = await _get_block_collection(repository)

    result = await collection.delete_one({
        "blocker_id": user_id,
        "blocked_user_id": int(target_user_id),
    })

    return {
        "ok": True,
        "unblocked": bool(result.deleted_count),
        "user_id": int(target_user_id),
    }


# ---------------------------------------------------------
# Reports
# ---------------------------------------------------------

@router.post("/safety/reports", status_code=201)
async def create_report(
    payload: ReportCreate,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    user_id = _user_id(user)

    await _report_rate_limit(user_id)

    target_type = payload.target_type.value
    target_id = payload.target_id.strip()

    if not target_id:
        raise HTTPException(
            status_code=400,
            detail="invalid_report_target",
        )

    if target_type == "user":
        try:
            target_numeric_id = int(target_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail="invalid_user_id",
            ) from exc

        if target_numeric_id == user_id:
            raise HTTPException(
                status_code=400,
                detail="cannot_report_self",
            )

        target = await repository.profiles.find_one({
            "_id": target_numeric_id,
        })

        if not target:
            raise HTTPException(
                status_code=404,
                detail="report_target_not_found",
            )

        normalized_target_id = str(target_numeric_id)

    elif target_type == "playlist":
        target = await repository.playlists.find_one({
            "_id": target_id,
            "deleted_at": {"$exists": False},
        })

        if not target:
            raise HTTPException(
                status_code=404,
                detail="report_target_not_found",
            )

        # Do not allow a user to report their own playlist.
        if int(target.get("owner_id", 0)) == user_id:
            raise HTTPException(
                status_code=400,
                detail="cannot_report_own_content",
            )

        normalized_target_id = target_id

    elif target_type == "track":
        # Track IDs are YouTube video IDs.
        if (
            len(target_id) != 11
            or not target_id.replace("-", "").replace("_", "").isalnum()
        ):
            raise HTTPException(
                status_code=400,
                detail="invalid_track_id",
            )

        normalized_target_id = target_id

    else:
        raise HTTPException(
            status_code=400,
            detail="invalid_report_target_type",
        )

    collection = await _get_report_collection(repository)

    now = utcnow()

    report_id = secrets.token_urlsafe(20)

    document = {
        "_id": report_id,
        "reporter_id": user_id,
        "target_type": target_type,
        "target_id": normalized_target_id,
        "reason": payload.reason.strip(),
        "details": payload.details.strip(),
        "status": "open",
        "reviewed_by": None,
        "reviewed_at": None,
        "created_at": now,
        "updated_at": now,
    }

    await collection.insert_one(document)

    return {
        "ok": True,
        "report_id": report_id,
        "status": "open",
        "message": "Report submitted for review.",
    }


@router.get("/safety/reports/mine")
async def list_my_reports(
    limit: int = 30,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    user_id = _user_id(user)

    limit = max(1, min(int(limit), 50))

    collection = await _get_report_collection(repository)

    cursor = collection.find(
        {"reporter_id": user_id},
        {
            "reporter_id": 0,
            "reviewed_by": 0,
        },
    ).sort(
        "created_at",
        -1,
    ).limit(limit)

    results = []

    async for item in cursor:
        results.append(_serialize(item))

    return {
        "ok": True,
        "results": results,
    }


# ---------------------------------------------------------
# Privacy controls
# ---------------------------------------------------------

@router.get("/account/privacy")
async def get_privacy_settings(
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    user_id = _user_id(user)

    profile = await repository.profiles.find_one({
        "_id": user_id,
    })

    if not profile:
        raise HTTPException(
            status_code=404,
            detail="profile_not_found",
        )

    settings = await repository.get_settings(user_id)

    return {
        "ok": True,
        "privacy": {
            "visibility": profile.get(
                "visibility",
                "public",
            ),
            "discoverable": bool(
                profile.get("discoverable", True)
            ),
            "show_activity": bool(
                settings.get("show_activity", True)
            ),
            "personalized_recommendations": bool(
                settings.get(
                    "personalized_recommendations",
                    True,
                )
            ),
        },
    }


@router.patch("/account/privacy")
async def update_privacy_settings(
    payload: PrivacyUpdate,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    user_id = _user_id(user)

    update = payload.model_dump(
        exclude_unset=True,
    )

    if not update:
        raise HTTPException(
            status_code=400,
            detail="empty_privacy_update",
        )

    profile_update = {}
    settings_update = {}

    if "visibility" in update:
        if update["visibility"] not in {
            "public",
            "private",
        }:
            raise HTTPException(
                status_code=422,
                detail="invalid_profile_visibility",
            )

        profile_update["visibility"] = update["visibility"]

    if "discoverable" in update:
        profile_update["discoverable"] = bool(
            update["discoverable"]
        )

    if "show_activity" in update:
        settings_update["show_activity"] = bool(
            update["show_activity"]
        )

    if "personalized_recommendations" in update:
        settings_update["personalized_recommendations"] = bool(
            update["personalized_recommendations"]
        )

    now = utcnow()

    if profile_update:
        profile_update["updated_at"] = now

        result = await repository.profiles.update_one(
            {"_id": user_id},
            {"$set": profile_update},
        )

        if not result.matched_count:
            raise HTTPException(
                status_code=404,
                detail="profile_not_found",
            )

    if settings_update:
        await repository.settings.update_one(
            {"_id": user_id},
            {
                "$set": {
                    **settings_update,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "created_at": now,
                },
            },
            upsert=True,
        )

    return {
        "ok": True,
        "updated": True,
        "privacy": {
            **profile_update,
            **settings_update,
        },
    }


# ---------------------------------------------------------
# Personal data export
# ---------------------------------------------------------

@router.get("/account/export")
async def export_account_data(
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    user_id = _user_id(user)

    profile = await repository.profiles.find_one({
        "_id": user_id,
    })

    if not profile:
        raise HTTPException(
            status_code=404,
            detail="profile_not_found",
        )

    database = repository.profiles.database

    playlists = await _collect(
        repository.playlists,
        {
            "owner_id": user_id,
        },
    )

    collaborated_playlists = await _collect(
        repository.playlists,
        {
            "collaborators.user_id": user_id,
            "deleted_at": {"$exists": False},
        },
    )

    history = await _collect(
        repository.listening_history,
        {
            "_id": user_id,
        },
    )

    track_likes = await _collect(
        repository.track_likes,
        {
            "user_id": user_id,
        },
    )

    playlist_likes = await _collect(
        repository.playlist_likes,
        {
            "user_id": user_id,
        },
    )

    playlist_follows = await _collect(
        repository.playlist_follows,
        {
            "user_id": user_id,
        },
    )

    following = await _collect(
        repository.user_follows,
        {
            "follower_id": user_id,
        },
    )

    followers = await _collect(
        repository.user_follows,
        {
            "following_id": user_id,
        },
    )

    invitations_sent = await _collect(
        repository.invitations,
        {
            "invited_by": user_id,
        },
    )

    invitations_received = await _collect(
        repository.invitations,
        {
            "invited_user_id": user_id,
        },
    )

    notifications = await _collect(
        repository.notifications,
        {
            "recipient_id": user_id,
        },
    )

    settings = await repository.get_settings(user_id)

    blocks = await _collect(
        database.music_user_blocks,
        {
            "blocker_id": user_id,
        },
    )

    blocked_by = await _collect(
        database.music_user_blocks,
        {
            "blocked_user_id": user_id,
        },
    )

    report_records = await _collect(
        database.music_reports,
        {
            "reporter_id": user_id,
        },
    )

    export = {
        "export_version": 1,
        "generated_at": utcnow().isoformat(),
        "account": _serialize(profile),
        "settings": _serialize(settings),
        "playlists_owned": playlists,
        "playlists_collaborated": collaborated_playlists,
        "listening_history": history,
        "liked_tracks": track_likes,
        "liked_playlists": playlist_likes,
        "followed_playlists": playlist_follows,
        "following": following,
        "followers": followers,
        "invitations_sent": invitations_sent,
        "invitations_received": invitations_received,
        "notifications": notifications,
        "blocked_users": blocks,
        "blocked_by": blocked_by,
        "reports": report_records,
    }

    # JSON serialization here also validates that no unsupported
    # MongoDB values remain in the export response.
    try:
        json.dumps(
            export,
            ensure_ascii=False,
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=500,
            detail="account_export_serialization_failed",
        ) from exc

    return {
        "ok": True,
        "export": export,
    }


# ---------------------------------------------------------
# Account deletion request
# ---------------------------------------------------------

@router.post("/account/delete-request", status_code=202)
async def request_account_deletion(
    payload: DeleteAccountRequest,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    user_id = _user_id(user)

    if payload.confirmation != "DELETE":
        raise HTTPException(
            status_code=400,
            detail="deletion_confirmation_mismatch",
        )

    profile = await repository.profiles.find_one({
        "_id": user_id,
    })

    if not profile:
        raise HTTPException(
            status_code=404,
            detail="profile_not_found",
        )

    if profile.get("banned"):
        raise HTTPException(
            status_code=403,
            detail="account_unavailable",
        )

    if profile.get("deletion_requested_at"):
        return {
            "ok": True,
            "status": "pending",
            "message": "An account deletion request already exists.",
        }

    collection = await _get_deletion_collection(repository)

    now = utcnow()

    request_id = secrets.token_urlsafe(24)

    existing = await collection.find_one({
        "user_id": user_id,
        "status": "pending",
    })

    if existing:
        return {
            "ok": True,
            "status": "pending",
            "request_id": existing.get("_id"),
        }

    await collection.insert_one({
        "_id": request_id,
        "user_id": user_id,
        "status": "pending",
        "reason": payload.reason.strip(),
        "requested_at": now,
        "processed_at": None,
        "processed_by": None,
    })

    # Hide the account from discovery immediately while the request
    # awaits the deletion worker/admin process.
    await repository.profiles.update_one(
        {"_id": user_id},
        {
            "$set": {
                "visibility": "private",
                "discoverable": False,
                "deletion_requested_at": now,
                "updated_at": now,
            }
        },
    )

    # Revoke all active refresh sessions. Current access JWTs expire
    # naturally; the account status is checked by protected routes.
    await repository.sessions.update_many(
        {
            "user_id": user_id,
            "revoked": False,
        },
        {
            "$set": {
                "revoked": True,
                "revoked_at": int(time.time()),
            }
        },
    )

    await repository.audit_log.insert_one({
        "actor_id": user_id,
        "target_user_id": user_id,
        "action": "account_deletion_requested",
        "reason": payload.reason.strip(),
        "created_at": now,
    })

    return {
        "ok": True,
        "status": "pending",
        "request_id": request_id,
        "message": (
            "Your account deletion request has been recorded. "
            "Your profile is hidden while the request is pending."
        ),
    }


@router.get("/account/deletion-status")
async def account_deletion_status(
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    user_id = _user_id(user)

    collection = await _get_deletion_collection(repository)

    request = await collection.find_one(
        {"user_id": user_id},
        sort=[("requested_at", -1)],
    )

    if not request:
        return {
            "ok": True,
            "status": "none",
            "request": None,
        }

    return {
        "ok": True,
        "status": request.get("status", "pending"),
        "request": {
            "request_id": request.get("_id"),
            "requested_at": _serialize(
                request.get("requested_at")
            ),
            "processed_at": _serialize(
                request.get("processed_at")
            ),
        },
    }
