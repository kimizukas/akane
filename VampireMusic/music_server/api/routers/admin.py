from __future__ import annotations

import re
import time

from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
)

from VampireMusic import db

from VampireMusic.music_server.api.dependencies import (
    get_repository,
)

from VampireMusic.music_server.api.repository import (
    MusicRepository,
    utcnow,
)

from VampireMusic.music_server.api.schemas import (
    AdminBanRequest,
)

from VampireMusic.music_server.api.security import (
    get_current_user,
    require_owner,
)


router = APIRouter(
    prefix="/api/admin",
    tags=["Administration"],
)


@router.get("/overview")
async def admin_overview(
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    await require_owner(user)

    profiles = repository.profiles
    playlists = repository.playlists
    notifications = repository.notifications
    sessions = repository.sessions

    users_count = await profiles.count_documents({
        "banned": {"$ne": True},
    })

    banned_count = await profiles.count_documents({
        "banned": True,
    })

    playlists_count = await playlists.count_documents({
        "deleted_at": {"$exists": False},
    })

    public_playlists_count = await playlists.count_documents({
        "visibility": "public",
        "deleted_at": {"$exists": False},
    })

    unread_notifications = await notifications.count_documents({
        "read_at": None,
    })

    active_sessions = await sessions.count_documents({
        "revoked": False,
        "expires_at": {"$gt": int(time.time())},
    })

    active_group_calls = len(
        getattr(db, "active_calls", {}) or {}
    )

    return {
        "ok": True,
        "stats": {
            "users": users_count,
            "banned_users": banned_count,
            "playlists": playlists_count,
            "public_playlists": public_playlists_count,
            "unread_notifications": unread_notifications,
            "active_sessions": active_sessions,
            "active_group_calls": active_group_calls,
        },
    }


@router.get("/users")
async def admin_search_users(
    q: str = Query(default="", max_length=80),
    limit: int = Query(default=30, ge=1, le=50),
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    await require_owner(user)

    query: dict = {}

    if q.strip():
        pattern = re.compile(
            re.escape(q.strip()),
            re.IGNORECASE,
        )

        try:
            numeric_id = int(q.strip())
        except ValueError:
            numeric_id = None

        query["$or"] = [
            {"handle": pattern},
            {"display_name": pattern},
            {"telegram_username": pattern},
        ]

        if numeric_id is not None:
            query["$or"].append({
                "_id": numeric_id,
            })

    cursor = repository.profiles.find(
        query,
        {
            "telegram_username": 1,
            "handle": 1,
            "display_name": 1,
            "avatar_url": 1,
            "banned": 1,
            "created_at": 1,
            "last_seen_at": 1,
        },
    ).sort(
        "last_seen_at",
        -1,
    ).limit(limit)

    results = []

    async for item in cursor:
        results.append({
            "user_id": int(item["_id"]),
            "telegram_username": item.get("telegram_username"),
            "handle": item.get("handle"),
            "display_name": item.get("display_name"),
            "avatar_url": item.get("avatar_url"),
            "banned": bool(item.get("banned", False)),
            "created_at": (
                item["created_at"].isoformat()
                if isinstance(item.get("created_at"), datetime)
                else None
            ),
            "last_seen_at": (
                item["last_seen_at"].isoformat()
                if isinstance(item.get("last_seen_at"), datetime)
                else None
            ),
        })

    return {
        "ok": True,
        "results": results,
    }


@router.post("/users/{user_id}/ban")
async def admin_set_user_ban(
    user_id: int,
    payload: AdminBanRequest,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    await require_owner(user)

    if int(user_id) == int(user["id"]):
        raise HTTPException(
            status_code=400,
            detail="cannot_ban_self",
        )

    profile = await repository.profiles.find_one({
        "_id": int(user_id),
    })

    if not profile:
        raise HTTPException(
            status_code=404,
            detail="user_not_found",
        )

    now = utcnow()

    await repository.profiles.update_one(
        {"_id": int(user_id)},
        {
            "$set": {
                "banned": bool(payload.banned),
                "ban_reason": payload.reason,
                "updated_at": now,
            }
        },
    )

    await repository.audit_log.insert_one({
        "actor_id": int(user["id"]),
        "target_user_id": int(user_id),
        "action": (
            "user_banned"
            if payload.banned
            else "user_unbanned"
        ),
        "reason": payload.reason,
        "created_at": now,
    })

    # Revoke all active refresh sessions for the affected user.
    await repository.sessions.update_many(
        {
            "user_id": int(user_id),
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
        "user_id": int(user_id),
        "banned": bool(payload.banned),
    }


@router.get("/audit")
async def admin_audit_log(
    limit: int = Query(default=50, ge=1, le=100),
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    await require_owner(user)

    cursor = repository.audit_log.find().sort(
        "created_at",
        -1,
    ).limit(limit)

    results = []

    async for item in cursor:
        results.append({
            "id": str(item.get("_id", "")),
            "actor_id": item.get("actor_id"),
            "target_user_id": item.get("target_user_id"),
            "action": item.get("action"),
            "reason": item.get("reason", ""),
            "created_at": (
                item["created_at"].isoformat()
                if isinstance(item.get("created_at"), datetime)
                else None
            ),
        })

    return {
        "ok": True,
        "results": results,
    }