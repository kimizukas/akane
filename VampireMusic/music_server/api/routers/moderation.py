from __future__ import annotations

import asyncio
import re
import secrets
import time

from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from VampireMusic import config

from VampireMusic.music_server.api.dependencies import get_repository
from VampireMusic.music_server.api.repository import MusicRepository, utcnow
from VampireMusic.music_server.api.security import get_current_user, require_owner
from VampireMusic.music_server.api.settings import settings


router = APIRouter(
    prefix="/api/admin/moderation",
    tags=["Moderation"],
)

_REPORT_INDEX_LOCK = asyncio.Lock()
_REPORT_INDEXES_READY = False
_DELETION_LOCK = asyncio.Lock()
_FILENAME_PATTERN = re.compile(r"^[a-f0-9]{32}\.webp$")


class ReportReview(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    decision: Literal["resolve", "dismiss"]
    action: Literal[
        "none",
        "ban_user",
        "unban_user",
        "hide_playlist",
        "restore_playlist",
    ] = "none"
    note: str = Field(default="", max_length=500)


class DeletionReview(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    decision: Literal["approve", "reject"]
    note: str = Field(default="", max_length=500)


async def _ensure_indexes(repository: MusicRepository) -> None:
    global _REPORT_INDEXES_READY

    if _REPORT_INDEXES_READY:
        return

    async with _REPORT_INDEX_LOCK:
        if _REPORT_INDEXES_READY:
            return

        database = repository.profiles.database
        await database["music_reports"].create_index(
            [("status", 1), ("created_at", -1)],
            name="music_report_review_queue",
        )
        await database["music_reports"].create_index(
            [("reporter_id", 1), ("created_at", -1)],
            name="music_report_by_user",
        )
        await database["music_account_deletion_requests"].create_index(
            [("status", 1), ("requested_at", -1)],
            name="music_deletion_review_queue",
        )
        await database["music_account_deletion_requests"].create_index(
            [("user_id", 1), ("status", 1)],
            name="music_account_deletion_status",
        )

        _REPORT_INDEXES_READY = True


def _iso(value: Any) -> str | None:
    return value.isoformat() if isinstance(value, datetime) else None


def _report_id(value: Any) -> str:
    return str(value) if value is not None else ""


async def _report_card(
    report: dict[str, Any],
    repository: MusicRepository,
) -> dict[str, Any]:
    reporter_id = report.get("reporter_id")
    reporter = None

    if isinstance(reporter_id, int):
        reporter_profile = await repository.profiles.find_one(
            {"_id": reporter_id},
            {"handle": 1, "display_name": 1, "avatar_url": 1},
        )
        if reporter_profile:
            reporter = {
                "user_id": reporter_id,
                "handle": reporter_profile.get("handle"),
                "display_name": reporter_profile.get("display_name"),
                "avatar_url": reporter_profile.get("avatar_url"),
            }

    target: dict[str, Any] = {"id": report.get("target_id")}
    target_type = report.get("target_type")
    target_id = str(report.get("target_id", ""))

    if target_type == "user":
        try:
            target_user_id = int(target_id)
        except ValueError:
            target_user_id = 0

        if target_user_id > 0:
            profile = await repository.profiles.find_one(
                {"_id": target_user_id},
                {"handle": 1, "display_name": 1, "banned": 1},
            )
            if profile:
                target.update({
                    "user_id": target_user_id,
                    "handle": profile.get("handle"),
                    "display_name": profile.get("display_name"),
                    "banned": bool(profile.get("banned", False)),
                })

    elif target_type == "playlist":
        playlist = await repository.playlists.find_one(
            {"_id": target_id},
            {"name": 1, "owner_id": 1, "visibility": 1, "deleted_at": 1},
        )
        if playlist:
            target.update({
                "name": playlist.get("name"),
                "owner_id": playlist.get("owner_id"),
                "visibility": playlist.get("visibility"),
                "deleted": "deleted_at" in playlist,
            })

    elif target_type == "track":
        target["source"] = "YouTube"

    return {
        "id": _report_id(report.get("_id")),
        "reporter": reporter,
        "reporter_deleted": bool(report.get("reporter_deleted", False)),
        "target_type": target_type,
        "target": target,
        "reason": report.get("reason", ""),
        "details": report.get("details", ""),
        "status": report.get("status", "open"),
        "moderator_note": report.get("moderator_note", ""),
        "review_action": report.get("review_action", "none"),
        "reviewed_by": report.get("reviewed_by"),
        "reviewed_at": _iso(report.get("reviewed_at")),
        "created_at": _iso(report.get("created_at")),
        "updated_at": _iso(report.get("updated_at")),
    }


async def _audit(
    repository: MusicRepository,
    *,
    actor_id: int,
    action: str,
    reason: str = "",
    target_user_id: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    await repository.audit_log.insert_one({
        "actor_id": int(actor_id),
        "target_user_id": (
            int(target_user_id)
            if target_user_id is not None
            else None
        ),
        "action": action,
        "reason": reason,
        "metadata": metadata or {},
        "created_at": utcnow(),
    })


@router.get("/reports")
async def list_reports(
    status_filter: Literal["open", "resolved", "dismissed", "all"] = Query(
        default="open",
        alias="status",
    ),
    target_type: Literal["user", "playlist", "track"] | None = None,
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10000),
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    await require_owner(user)
    await _ensure_indexes(repository)

    collection = repository.profiles.database["music_reports"]
    query: dict[str, Any] = {}

    if status_filter != "all":
        query["status"] = status_filter

    if target_type:
        query["target_type"] = target_type

    total = await collection.count_documents(query)
    cursor = collection.find(query).sort(
        "created_at",
        -1,
    ).skip(offset).limit(limit)

    results = []
    async for report in cursor:
        results.append(await _report_card(report, repository))

    return {
        "ok": True,
        "total": total,
        "limit": limit,
        "offset": offset,
        "results": results,
    }


@router.patch("/reports/{report_id}")
async def review_report(
    report_id: str,
    payload: ReportReview,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    await require_owner(user)
    await _ensure_indexes(repository)

    if not 8 <= len(report_id) <= 128:
        raise HTTPException(status_code=404, detail="report_not_found")

    admin_id = int(user["id"])
    reports = repository.profiles.database["music_reports"]
    report = await reports.find_one({"_id": report_id})

    if not report:
        raise HTTPException(status_code=404, detail="report_not_found")

    if report.get("status", "open") != "open":
        raise HTTPException(status_code=409, detail="report_already_reviewed")

    action = payload.action
    target_type = report.get("target_type")
    target_id = str(report.get("target_id", ""))
    now = utcnow()
    target_user_id: int | None = None

    if payload.decision == "dismiss" and action != "none":
        raise HTTPException(
            status_code=422,
            detail="dismissed_reports_cannot_apply_actions",
        )

    if action in {"ban_user", "unban_user"}:
        if target_type != "user":
            raise HTTPException(status_code=422, detail="action_requires_user_report")

        try:
            target_user_id = int(target_id)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="invalid_report_user_id") from exc

        if target_user_id <= 0 or target_user_id == int(config.OWNER_ID):
            raise HTTPException(status_code=403, detail="protected_user_cannot_be_moderated")

        target_profile = await repository.profiles.find_one({"_id": target_user_id})
        if not target_profile:
            raise HTTPException(status_code=404, detail="report_target_not_found")
        if target_profile.get("account_deleted"):
            raise HTTPException(status_code=409, detail="deleted_account_cannot_be_moderated")

        if action == "ban_user":
            await repository.profiles.update_one(
                {"_id": target_user_id},
                {"$set": {
                    "banned": True,
                    "ban_reason": payload.note or "Moderation action",
                    "banned_at": now,
                    "updated_at": now,
                }},
            )
            await repository.sessions.update_many(
                {"user_id": target_user_id, "revoked": False},
                {"$set": {"revoked": True, "revoked_at": int(time.time())}},
            )

        else:
            await repository.profiles.update_one(
                {"_id": target_user_id},
                {"$set": {"banned": False, "updated_at": now},
                 "$unset": {"ban_reason": "", "banned_at": ""}},
            )

    elif action in {"hide_playlist", "restore_playlist"}:
        if target_type != "playlist":
            raise HTTPException(status_code=422, detail="action_requires_playlist_report")

        playlist_query = {"_id": target_id}
        if action == "hide_playlist":
            playlist_query["deleted_at"] = {"$exists": False}
        else:
            playlist_query["moderation_hidden"] = True
        playlist = await repository.playlists.find_one(playlist_query)
        if not playlist:
            raise HTTPException(status_code=404, detail="report_target_not_found")

        if action == "hide_playlist":
            update: dict[str, Any] = {
                "visibility": "private",
                "deleted_at": now,
                "moderation_hidden": True,
                "moderation_hidden_at": now,
                "moderation_hidden_by": admin_id,
                "updated_at": now,
            }
            if not playlist.get("moderation_hidden"):
                update["moderation_previous_visibility"] = playlist.get(
                    "visibility", "private"
                )
            await repository.playlists.update_one(
                {"_id": target_id},
                {"$set": update},
            )
        else:
            if not playlist.get("moderation_hidden"):
                raise HTTPException(status_code=409, detail="playlist_not_moderation_hidden")

            previous_visibility = playlist.get(
                "moderation_previous_visibility",
                "private",
            )
            if previous_visibility not in {"private", "public", "unlisted"}:
                previous_visibility = "private"
            await repository.playlists.update_one(
                {"_id": target_id},
                {"$set": {
                    "visibility": previous_visibility,
                    "moderation_hidden": False,
                    "updated_at": now,
                }, "$unset": {
                    "deleted_at": "",
                    "moderation_hidden_at": "",
                    "moderation_hidden_by": "",
                    "moderation_previous_visibility": "",
                }},
            )

    elif action != "none":
        raise HTTPException(status_code=422, detail="unsupported_moderation_action")

    new_status = "resolved" if payload.decision == "resolve" else "dismissed"
    result = await reports.update_one(
        {"_id": report_id, "status": "open"},
        {"$set": {
            "status": new_status,
            "review_action": action,
            "moderator_note": payload.note,
            "reviewed_by": admin_id,
            "reviewed_at": now,
            "updated_at": now,
        }},
    )

    if not result.matched_count:
        raise HTTPException(status_code=409, detail="report_already_reviewed")

    await _audit(
        repository,
        actor_id=admin_id,
        target_user_id=target_user_id,
        action="report_reviewed",
        reason=payload.note,
        metadata={
            "report_id": report_id,
            "decision": payload.decision,
            "moderation_action": action,
            "target_type": target_type,
            "target_id": target_id,
        },
    )

    return {
        "ok": True,
        "report_id": report_id,
        "status": new_status,
        "action": action,
    }


@router.get("/deletion-requests")
async def list_deletion_requests(
    status_filter: Literal["pending", "processing", "completed", "rejected", "all"] = Query(
        default="pending",
        alias="status",
    ),
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10000),
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    await require_owner(user)
    await _ensure_indexes(repository)

    collection = repository.profiles.database["music_account_deletion_requests"]
    query: dict[str, Any] = {}
    if status_filter != "all":
        query["status"] = status_filter

    total = await collection.count_documents(query)
    cursor = collection.find(query).sort(
        "requested_at",
        -1,
    ).skip(offset).limit(limit)

    results = []
    async for item in cursor:
        user_id = item.get("user_id")
        profile = None
        if isinstance(user_id, int):
            profile = await repository.profiles.find_one(
                {"_id": user_id},
                {"handle": 1, "display_name": 1, "banned": 1},
            )

        results.append({
            "request_id": str(item.get("_id", "")),
            "user_id": user_id,
            "user": ({
                "handle": profile.get("handle"),
                "display_name": profile.get("display_name"),
                "deleted": bool(profile.get("account_deleted", False)),
            } if profile else None),
            "status": item.get("status", "pending"),
            "reason": item.get("reason", ""),
            "moderator_note": item.get("moderator_note", ""),
            "requested_at": _iso(item.get("requested_at")),
            "processed_at": _iso(item.get("processed_at")),
            "processed_by": item.get("processed_by"),
        })

    return {
        "ok": True,
        "total": total,
        "limit": limit,
        "offset": offset,
        "results": results,
    }


async def _purge_account_data(
    repository: MusicRepository,
    user_id: int,
) -> None:
    database = repository.profiles.database
    now = utcnow()

    # Capture owned playlist IDs before deleting their documents.
    owned_playlist_ids = [
        item["_id"]
        async for item in repository.playlists.find(
            {"owner_id": user_id},
            {"_id": 1},
        )
    ]

    # Remove the account from collaboration lists on other playlists.
    await repository.playlists.update_many(
        {"collaborators.user_id": user_id},
        {
            "$pull": {"collaborators": {"user_id": user_id}},
            "$set": {"updated_at": now},
        },
    )

    if owned_playlist_ids:
        await repository.playlist_likes.delete_many({
            "playlist_id": {"$in": owned_playlist_ids},
        })
        await repository.playlist_follows.delete_many({
            "playlist_id": {"$in": owned_playlist_ids},
        })
        await repository.playlists.delete_many({
            "_id": {"$in": owned_playlist_ids},
        })

    await repository.user_follows.delete_many({
        "$or": [
            {"follower_id": user_id},
            {"following_id": user_id},
        ],
    })
    await repository.playlist_likes.delete_many({"user_id": user_id})
    await repository.playlist_follows.delete_many({"user_id": user_id})
    await repository.track_likes.delete_many({"user_id": user_id})
    await repository.listening_history.delete_one({"_id": user_id})

    invitation_query: dict[str, Any] = {
        "$or": [
            {"invited_user_id": user_id},
            {"invited_by": user_id},
        ],
    }
    if owned_playlist_ids:
        invitation_query["$or"].append({
            "playlist_id": {"$in": owned_playlist_ids},
        })
    await repository.invitations.delete_many(invitation_query)

    notification_query: dict[str, Any] = {
        "$or": [
            {"recipient_id": user_id},
            {"actor_id": user_id},
        ],
    }
    if owned_playlist_ids:
        notification_query["$or"].append({
            "payload.playlist_id": {"$in": owned_playlist_ids},
        })
    await repository.notifications.delete_many(notification_query)

    await repository.sessions.delete_many({"user_id": user_id})
    await repository.settings.delete_one({"_id": user_id})

    await database["music_user_blocks"].delete_many({
        "$or": [
            {"blocker_id": user_id},
            {"blocked_user_id": user_id},
        ],
    })

    # Keep reports for moderation history, but remove reporter identity.
    await database["music_reports"].update_many(
        {"reporter_id": user_id},
        {"$set": {"reporter_id": None, "reporter_deleted": True}},
    )

    # Delete unreferenced covers belonging to the account. A cover still used
    # by another surviving profile or playlist is retained to avoid breaking it.
    cover_collection = database["music_cover_uploads"]
    cover_records = [
        item
        async for item in cover_collection.find(
            {"user_id": user_id},
            {"_id": 1},
        )
    ]
    upload_directory = settings.upload_directory.resolve()
    for item in cover_records:
        filename = str(item.get("_id", ""))
        if not _FILENAME_PATTERN.fullmatch(filename):
            continue
        file_path = (upload_directory / filename).resolve()
        if file_path.parent != upload_directory:
            continue

        cover_url = f"/media/covers/{filename}"
        playlist_usage = await repository.playlists.count_documents({
            "cover_url": cover_url,
            "deleted_at": {"$exists": False},
        })
        profile_usage = await repository.profiles.count_documents({
            "avatar_url": cover_url,
            "_id": {"$ne": user_id},
        })
        if not playlist_usage and not profile_usage:
            await asyncio.to_thread(file_path.unlink, missing_ok=True)
    await cover_collection.delete_many({"user_id": user_id})

    # Retain audit events but anonymize the deleted account's identifiers.
    await repository.audit_log.update_many(
        {"$or": [
            {"actor_id": user_id},
            {"target_user_id": user_id},
        ]},
        {"$set": {
            "actor_id": None,
            "target_user_id": None,
            "reason": "",
        }},
    )

    # Keep a non-identifying tombstone so the ID cannot be re-created as a
    # fresh account and all existing access tokens are rejected as banned.
    await repository.profiles.update_one(
        {"_id": user_id},
        {
            "$set": {
                "handle": f"deleted_{secrets.token_hex(8)}",
                "display_name": "Deleted account",
                "bio": "",
                "avatar_url": None,
                "visibility": "private",
                "discoverable": False,
                "banned": True,
                "account_deleted": True,
                "updated_at": now,
            },
            "$unset": {
                "telegram_username": "",
                "last_seen_at": "",
                "deletion_requested_at": "",
                "ban_reason": "",
                "banned_at": "",
            },
        },
    )


@router.post("/deletion-requests/{request_id}/process")
async def process_deletion_request(
    request_id: str,
    payload: DeletionReview,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    await require_owner(user)
    await _ensure_indexes(repository)

    if not 16 <= len(request_id) <= 128:
        raise HTTPException(status_code=404, detail="deletion_request_not_found")

    collection = repository.profiles.database["music_account_deletion_requests"]
    admin_id = int(user["id"])

    async with _DELETION_LOCK:
        request = await collection.find_one({"_id": request_id})
        if not request:
            raise HTTPException(status_code=404, detail="deletion_request_not_found")

        current_status = request.get("status", "pending")
        if current_status == "completed":
            return {"ok": True, "status": "completed", "already_processed": True}
        if current_status == "rejected":
            raise HTTPException(status_code=409, detail="deletion_request_already_rejected")

        user_id = int(request.get("user_id", 0))
        if user_id <= 0:
            raise HTTPException(status_code=409, detail="deletion_request_user_invalid")

        now = utcnow()

        if payload.decision == "reject":
            if current_status != "pending":
                raise HTTPException(status_code=409, detail="deletion_request_processing")

            result = await collection.update_one(
                {"_id": request_id, "status": "pending"},
                {"$set": {
                    "status": "rejected",
                    "processed_by": admin_id,
                    "processed_at": now,
                    "moderator_note": payload.note,
                }},
            )
            if not result.matched_count:
                raise HTTPException(status_code=409, detail="deletion_request_already_processed")

            await repository.profiles.update_one(
                {"_id": user_id},
                {"$unset": {"deletion_requested_at": ""},
                 "$set": {"updated_at": now}},
            )
            await _audit(
                repository,
                actor_id=admin_id,
                target_user_id=user_id,
                action="account_deletion_rejected",
                reason=payload.note,
                metadata={"request_id": request_id},
            )
            return {"ok": True, "status": "rejected", "request_id": request_id}

        # An interrupted request remains in `processing`; the same approve
        # action can safely resume because each purge operation is idempotent.
        await collection.update_one(
            {"_id": request_id, "status": {"$in": ["pending", "processing"]}},
            {"$set": {
                "status": "processing",
                "processing_by": admin_id,
                "processing_at": now,
                "moderator_note": payload.note,
            }},
        )

        try:
            await _purge_account_data(repository, user_id)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            await collection.update_one(
                {"_id": request_id},
                {"$set": {
                    "status": "processing",
                    "last_error": type(exc).__name__,
                    "updated_at": utcnow(),
                }},
            )
            raise HTTPException(
                status_code=503,
                detail="account_deletion_processing_failed_retry_available",
            ) from exc

        processed_at = utcnow()
        await collection.update_one(
            {"_id": request_id},
            {"$set": {
                "status": "completed",
                "processed_by": admin_id,
                "processed_at": processed_at,
                "moderator_note": payload.note,
                "reason": "",
            }, "$unset": {"last_error": "", "processing_by": "", "processing_at": ""}},
        )

        await _audit(
            repository,
            actor_id=admin_id,
            action="account_deletion_completed",
            reason=payload.note,
            metadata={"request_id": request_id},
        )

        return {
            "ok": True,
            "status": "completed",
            "request_id": request_id,
            "message": "Account data purge completed; a non-identifying tombstone remains to reject old access tokens.",
        }
