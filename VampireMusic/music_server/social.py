from __future__ import annotations

import logging
import re
import secrets
from datetime import datetime, timezone
from functools import wraps
from typing import Any
from urllib.parse import urlparse

from aiohttp import web
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError

from VampireMusic.core.youtube import VIDEO_ID_RE


logger = logging.getLogger("VampireMusic.music_server.social")

MAX_PLAYLIST_TRACKS = 500
MAX_PAGE_SIZE = 50
VALID_VISIBILITY = {"private", "public", "unlisted"}
VALID_ROLES = {"editor", "contributor", "viewer"}
HANDLE_RE = re.compile(r"^[a-z0-9_]{3,24}$")


class APIError(Exception):
    def __init__(self, code: str, status: int = 400, message: str | None = None):
        super().__init__(message or code)
        self.code = code
        self.status = status
        self.message = message or code.replace("_", " ")


@web.middleware
async def social_error_middleware(request: web.Request, handler):
    social_prefixes = (
        "/api/profile", "/api/people", "/api/search/people", "/api/search/playlists",
        "/api/playlists", "/api/invitations", "/api/notifications",
        "/api/tracks", "/api/library/liked-tracks", "/api/listening",
    )
    store = request.app.get("social_store")
    if request.path.startswith(social_prefixes) and store and not store.ready:
        return web.json_response(
            {"ok": False, "error": "social_storage_unavailable"}, status=503
        )
    try:
        return await handler(request)
    except APIError as exc:
        return web.json_response(
            {"ok": False, "error": exc.code, "message": exc.message},
            status=exc.status,
        )
    except DuplicateKeyError:
        return web.json_response(
            {"ok": False, "error": "already_exists"}, status=409
        )


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: Any) -> str | None:
    return value.isoformat() if isinstance(value, datetime) else None


def clean_text(value: Any, limit: int, *, allow_empty: bool = True) -> str:
    if not isinstance(value, str):
        raise APIError("invalid_text", 400)
    value = "".join(ch for ch in value.strip() if ch >= " " or ch in "\n\t")
    if len(value) > limit or (not allow_empty and not value):
        raise APIError("invalid_text_length", 400)
    return value


def safe_https_url(value: Any, *, optional: bool = True) -> str | None:
    if value in (None, "") and optional:
        return None
    if not isinstance(value, str) or len(value) > 2048:
        raise APIError("invalid_url", 400)
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
        raise APIError("https_url_required", 400)
    return value


def page_size(request: web.Request, default: int = 20) -> int:
    try:
        value = int(request.query.get("limit", default))
    except (TypeError, ValueError):
        raise APIError("invalid_limit", 400)
    return max(1, min(value, MAX_PAGE_SIZE))


async def json_body(request: web.Request) -> dict[str, Any]:
    try:
        data = await request.json()
    except Exception:
        raise APIError("invalid_json", 400)
    if not isinstance(data, dict):
        raise APIError("json_object_required", 400)
    return data


class SocialStore:
    def __init__(self, database):
        self.profiles = database.music_profiles
        self.playlists = database.music_playlists
        self.user_follows = database.music_user_follows
        self.playlist_follows = database.music_playlist_follows
        self.playlist_likes = database.music_playlist_likes
        self.listening_history = database.music_listening_history
        self.track_likes = database.music_track_likes
        self.invitations = database.music_invitations
        self.notifications = database.music_notifications
        self.ready = False

    async def ensure_indexes(self) -> None:
        await self.profiles.create_index(
            [("handle", ASCENDING)], unique=True, name="uniq_music_handle"
        )
        await self.profiles.create_index(
            [("discoverable", ASCENDING), ("handle", ASCENDING)],
            name="music_profile_discovery",
        )
        await self.playlists.create_index(
            [("owner_id", ASCENDING), ("created_at", DESCENDING)],
            name="music_owner_playlists",
        )
        await self.playlists.create_index(
            [("visibility", ASCENDING), ("updated_at", DESCENDING)],
            name="music_public_playlists",
        )
        await self.user_follows.create_index(
            [("follower_id", ASCENDING), ("following_id", ASCENDING)],
            unique=True,
            name="uniq_music_user_follow",
        )
        await self.user_follows.create_index(
            [("following_id", ASCENDING), ("status", ASCENDING)],
            name="music_follow_requests",
        )
        await self.playlist_follows.create_index(
            [("user_id", ASCENDING), ("playlist_id", ASCENDING)],
            unique=True,
            name="uniq_music_playlist_follow",
        )
        await self.playlist_likes.create_index(
            [("user_id", ASCENDING), ("playlist_id", ASCENDING)],
            unique=True,
            name="uniq_music_playlist_like",
        )
        await self.track_likes.create_index(
            [("user_id", ASCENDING), ("track_id", ASCENDING)],
            unique=True,
            name="uniq_music_track_like",
        )
        await self.track_likes.create_index(
            [("user_id", ASCENDING), ("created_at", DESCENDING)],
            name="music_liked_tracks",
        )
        await self.invitations.create_index(
            [("playlist_id", ASCENDING), ("invited_user_id", ASCENDING)],
            unique=True,
            name="uniq_music_invitation_target",
        )
        await self.invitations.create_index(
            [("invited_user_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)],
            name="music_invitation_inbox",
        )
        await self.notifications.create_index(
            [("recipient_id", ASCENDING), ("created_at", DESCENDING)],
            name="music_notification_inbox",
        )
        await self.listening_history.create_index(
    [("updated_at", DESCENDING)],
    name="music_listening_history_updated",
)
        self.ready = True
       

    async def ensure_profile(self, user: dict[str, Any]) -> dict[str, Any]:
        user_id = int(user["id"])
        existing = await self.profiles.find_one({"_id": user_id})
        if existing:
            # Keep the user-editable display name and handle; only refresh Telegram metadata.
            await self.profiles.update_one(
                {"_id": user_id},
                {"$set": {
                    "telegram_username": user.get("username"),
                    "last_seen_at": utcnow(),
                }},
            )
            return await self.profiles.find_one({"_id": user_id})

        raw_handle = str(user.get("username") or f"listener_{user_id}").lower().lstrip("@")
        handle = raw_handle if HANDLE_RE.fullmatch(raw_handle) else f"listener_{user_id}"
        now = utcnow()
        profile = {
            "_id": user_id,
            "handle": handle,
            "display_name": clean_text(user.get("first_name") or "Listener", 48, allow_empty=False),
            "bio": "",
            "avatar_url": safe_https_url(user.get("photo_url")),
            "telegram_username": user.get("username"),
            "visibility": "public",
            "discoverable": True,
            "created_at": now,
            "updated_at": now,
            "last_seen_at": now,
        }
        try:
            await self.profiles.insert_one(profile)
        except DuplicateKeyError:
            # A parallel Mini App request may have created this same profile.
            existing = await self.profiles.find_one({"_id": user_id})
            if existing:
                return existing
            # Telegram handle may already belong to another profile record.
            profile["handle"] = f"listener_{user_id}"
            try:
                await self.profiles.insert_one(profile)
            except DuplicateKeyError:
                existing = await self.profiles.find_one({"_id": user_id})
                if existing:
                    return existing
                raise
        return profile

    async def notify(
        self,
        recipient_id: int,
        actor_id: int | None,
        kind: str,
        payload: dict[str, Any],
    ) -> None:
        if recipient_id == actor_id:
            return
        await self.notifications.insert_one({
            "_id": secrets.token_urlsafe(18),
            "recipient_id": int(recipient_id),
            "actor_id": int(actor_id) if actor_id is not None else None,
            "type": kind,
            "payload": payload,
            "read_at": None,
            "created_at": utcnow(),
        })

    async def get_playlist(self, playlist_id: str) -> dict[str, Any]:
        if not isinstance(playlist_id, str) or not 8 <= len(playlist_id) <= 64:
            raise APIError("playlist_not_found", 404)
        doc = await self.playlists.find_one({
            "_id": playlist_id,
            "deleted_at": {"$exists": False},
        })
        if not doc:
            raise APIError("playlist_not_found", 404)
        return doc

    @staticmethod
    def role_for(doc: dict[str, Any], user_id: int) -> str | None:
        if doc["owner_id"] == user_id:
            return "owner"
        for item in doc.get("collaborators", []):
            if int(item.get("user_id", 0)) == user_id:
                return item.get("role")
        return None

    async def require_playlist_role(
        self, doc: dict[str, Any], user_id: int, allowed: set[str]
    ) -> str:
        role = self.role_for(doc, user_id)
        if role not in allowed:
            raise APIError("permission_denied", 403)
        return role

    async def can_view_playlist(self, doc: dict[str, Any], user_id: int) -> bool:
        return (
            doc.get("visibility") in {"public", "unlisted"}
            or self.role_for(doc, user_id) is not None
        )

    async def playlist_payload(
        self, doc: dict[str, Any], viewer_id: int, *, include_tracks: bool = False
    ) -> dict[str, Any]:
        owner = await self.profiles.find_one({"_id": doc["owner_id"]}) or {}
        result = {
            "id": doc["_id"],
            "name": doc["name"],
            "description": doc.get("description", ""),
            "visibility": doc["visibility"],
            "owner": {
                "user_id": doc["owner_id"],
                "handle": owner.get("handle"),
                "display_name": owner.get("display_name", "Listener"),
                "avatar_url": owner.get("avatar_url"),
            },
            "role": self.role_for(doc, viewer_id),
            "track_count": int(doc.get("track_count", len(doc.get("tracks", [])))),
            "version": int(doc.get("version", 1)),
            "cover_url": doc.get("cover_url"),
            "icon": doc.get("icon"),
            "created_at": iso(doc.get("created_at")),
            "updated_at": iso(doc.get("updated_at")),
            "like_count": await self.playlist_likes.count_documents({"playlist_id": doc["_id"]}),
            "follower_count": await self.playlist_follows.count_documents({"playlist_id": doc["_id"]}),
            "liked": bool(await self.playlist_likes.find_one({"playlist_id": doc["_id"], "user_id": viewer_id})),
            "followed": bool(await self.playlist_follows.find_one({"playlist_id": doc["_id"], "user_id": viewer_id})),
        }
        if include_tracks:
            result["tracks"] = [
                {key: value for key, value in track.items() if key != "added_by"}
                for track in doc.get("tracks", [])
            ]
            collaborators = []
            if self.role_for(doc, viewer_id):
                for item in doc.get("collaborators", []):
                    collaborator_profile = await self.profiles.find_one({"_id": int(item["user_id"])}) or {}
                    collaborators.append({
                        "user_id": int(item["user_id"]),
                        "role": item.get("role"),
                        "handle": collaborator_profile.get("handle"),
                        "display_name": collaborator_profile.get("display_name", "Listener"),
                        "avatar_url": collaborator_profile.get("avatar_url"),
                    })
            result["collaborators"] = collaborators
        return result

    async def profile_payload(self, profile: dict[str, Any], viewer_id: int) -> dict[str, Any]:
        target_id = int(profile["_id"])
        relation = await self.user_follows.find_one({
            "follower_id": viewer_id,
            "following_id": target_id,
        }) if viewer_id != target_id else None
        return {
            "user_id": target_id,
            "handle": profile["handle"],
            "display_name": profile.get("display_name", "Listener"),
            "bio": profile.get("bio", ""),
            "avatar_url": profile.get("avatar_url"),
            "visibility": profile.get("visibility", "public"),
            "discoverable": bool(profile.get("discoverable", True)),
            "followers": await self.user_follows.count_documents({"following_id": target_id, "status": "accepted"}),
            "following": await self.user_follows.count_documents({"follower_id": target_id, "status": "accepted"}),
            "follow_state": relation.get("status") if relation else None,
            "is_self": target_id == viewer_id,
        }


class SocialAPI:
    def __init__(self, store: SocialStore):
        self.store = store

    def register(self, app: web.Application) -> None:
        app.router.add_get("/api/profile", self.my_profile)
        app.router.add_patch("/api/profile", self.update_profile)
        app.router.add_get("/api/people/{handle}", self.get_profile)
        app.router.add_post("/api/people/{user_id}/follow", self.follow_user)
        app.router.add_delete("/api/people/{user_id}/follow", self.unfollow_user)
        app.router.add_post("/api/people/{user_id}/follow-response", self.respond_follow)
        app.router.add_get("/api/search/people", self.search_people)
        app.router.add_get("/api/search/playlists", self.search_playlists)

        app.router.add_get("/api/playlists", self.list_playlists)
        app.router.add_post("/api/playlists", self.create_playlist)
        app.router.add_get("/api/playlists/{playlist_id}", self.get_playlist)
        app.router.add_patch("/api/playlists/{playlist_id}", self.update_playlist)
        app.router.add_delete("/api/playlists/{playlist_id}", self.delete_playlist)
        app.router.add_post("/api/playlists/{playlist_id}/tracks", self.add_track)
        app.router.add_delete("/api/playlists/{playlist_id}/tracks/{track_id}", self.remove_track)
        app.router.add_put("/api/playlists/{playlist_id}/tracks/order", self.reorder_tracks)
        app.router.add_post("/api/playlists/{playlist_id}/follow", self.follow_playlist)
        app.router.add_delete("/api/playlists/{playlist_id}/follow", self.unfollow_playlist)
        app.router.add_post("/api/playlists/{playlist_id}/like", self.like_playlist)
        app.router.add_delete("/api/playlists/{playlist_id}/like", self.unlike_playlist)
        app.router.add_post("/api/playlists/{playlist_id}/invitations", self.invite_collaborator)
        app.router.add_post("/api/tracks/{track_id}/like", self.like_track)
        app.router.add_delete("/api/tracks/{track_id}/like", self.unlike_track)
        app.router.add_get("/api/library/liked-tracks", self.list_liked_tracks)
        app.router.add_patch("/api/playlists/{playlist_id}/collaborators/{user_id}", self.update_collaborator)
        app.router.add_delete("/api/playlists/{playlist_id}/collaborators/{user_id}", self.remove_collaborator)

        app.router.add_get("/api/invitations", self.list_invitations)
        app.router.add_post("/api/invitations/{invitation_id}/respond", self.respond_invitation)
        app.router.add_get("/api/notifications", self.list_notifications)
        app.router.add_post("/api/notifications/{notification_id}/read", self.mark_notification_read)
        app.router.add_post(
    "/api/listening/history",
    self.record_listening,
)

    async def my_profile(self, request: web.Request):
        user = request["telegram_user"]
        profile = await self.store.ensure_profile(user)
        return web.json_response({"ok": True, "profile": await self.store.profile_payload(profile, int(user["id"]))})

    async def record_listening(self, request: web.Request):
        user_id = int(request["telegram_user"]["id"])
        data = await json_body(request)

        track_id = str(data.get("id", "")).strip()

        if not VIDEO_ID_RE.fullmatch(track_id):
            raise APIError("invalid_track_id", 400)

        title = clean_text(
            data.get("title"),
            160,
            allow_empty=False,
        )

        artist = clean_text(
            data.get("artist", "Unknown artist"),
            160,
        )

        try:
            duration_sec = int(data.get("duration_sec", 0))
        except (TypeError, ValueError):
            raise APIError("invalid_duration", 400)

        if not 0 <= duration_sec <= 86400:
            raise APIError("invalid_duration", 400)

        now = utcnow()

        item = {
            "id": track_id,
            "title": title,
            "artist": artist or "Unknown artist",
            "duration_sec": duration_sec,
            "thumbnail": safe_https_url(
                data.get("thumbnail")
            ),
            "played_at": now,
        }

        await self.store.listening_history.update_one(
            {"_id": user_id},
            {
                "$push": {
                    "items": {
                        "$each": [item],
                        "$position": 0,
                        "$slice": 60,
                    }
                },
                "$set": {
                    "updated_at": now,
                },
            },
            upsert=True,
        )

        return web.json_response({
            "ok": True,
            "recorded": True,
        })




    async def update_profile(self, request: web.Request):
        user_id = int(request["telegram_user"]["id"])
        await self.store.ensure_profile(request["telegram_user"])
        data = await json_body(request)
        allowed = {"handle", "display_name", "bio", "avatar_url", "visibility", "discoverable"}
        if not data or set(data) - allowed:
            raise APIError("invalid_profile_fields", 400)
        update: dict[str, Any] = {"updated_at": utcnow()}
        if "handle" in data:
            handle = clean_text(data["handle"], 24, allow_empty=False).lower().lstrip("@")
            if not HANDLE_RE.fullmatch(handle):
                raise APIError("invalid_handle", 400, "Use 3-24 letters, numbers or underscores.")
            update["handle"] = handle
        if "display_name" in data:
            update["display_name"] = clean_text(data["display_name"], 48, allow_empty=False)
        if "bio" in data:
            update["bio"] = clean_text(data["bio"], 160)
        if "avatar_url" in data:
            update["avatar_url"] = safe_https_url(data["avatar_url"])
        if "visibility" in data:
            if data["visibility"] not in {"public", "private"}:
                raise APIError("invalid_profile_visibility", 400)
            update["visibility"] = data["visibility"]
        if "discoverable" in data:
            if not isinstance(data["discoverable"], bool):
                raise APIError("invalid_discoverable_value", 400)
            update["discoverable"] = data["discoverable"]
        try:
            await self.store.profiles.update_one({"_id": user_id}, {"$set": update})
        except DuplicateKeyError:
            raise APIError("handle_taken", 409)
        profile = await self.store.profiles.find_one({"_id": user_id})
        return web.json_response({"ok": True, "profile": await self.store.profile_payload(profile, user_id)})

    async def get_profile(self, request: web.Request):
        viewer_id = int(request["telegram_user"]["id"])
        handle = request.match_info["handle"].lower().lstrip("@")
        profile = await self.store.profiles.find_one({"handle": handle, "discoverable": True})
        if not profile:
            raise APIError("profile_not_found", 404)
        target_id = int(profile["_id"])
        if profile.get("visibility") == "private" and target_id != viewer_id:
            relation = await self.store.user_follows.find_one({
                "follower_id": viewer_id, "following_id": target_id, "status": "accepted"
            })
            if not relation:
                raise APIError("private_profile", 403)
        payload = await self.store.profile_payload(profile, viewer_id)
        playlists = []
        cursor = self.store.playlists.find({
            "owner_id": target_id,
            "visibility": "public",
            "deleted_at": {"$exists": False},
        }).sort("updated_at", DESCENDING).limit(20)
        async for doc in cursor:
            playlists.append(await self.store.playlist_payload(doc, viewer_id))
        return web.json_response({"ok": True, "profile": payload, "playlists": playlists})

    async def search_people(self, request: web.Request):
        viewer_id = int(request["telegram_user"]["id"])
        query = clean_text(request.query.get("q", ""), 64, allow_empty=False).lower()
        if len(query) < 2:
            raise APIError("query_too_short", 400)
        pattern = re.compile(re.escape(query), re.IGNORECASE)
        cursor = self.store.profiles.find({
            "discoverable": True,
            "$or": [{"handle": pattern}, {"display_name": pattern}],
        }).limit(page_size(request))
        results = []
        async for profile in cursor:
            payload = await self.store.profile_payload(profile, viewer_id)
            if profile.get("visibility") == "private" and int(profile["_id"]) != viewer_id:
                # Expose only enough information to identify the account and request access.
                payload["bio"] = ""
                payload["avatar_url"] = None
                payload["followers"] = None
                payload["following"] = None
            results.append(payload)
        return web.json_response({"ok": True, "results": results})

    async def follow_user(self, request: web.Request):
        follower_id = int(request["telegram_user"]["id"])
        try:
            target_id = int(request.match_info["user_id"])
        except ValueError:
            raise APIError("invalid_user_id", 400)
        if target_id == follower_id:
            raise APIError("cannot_follow_self", 400)
        target = await self.store.profiles.find_one({"_id": target_id, "discoverable": True})
        if not target:
            raise APIError("profile_not_found", 404)
        existing = await self.store.user_follows.find_one({"follower_id": follower_id, "following_id": target_id})
        if existing and existing.get("status") in {"pending", "accepted"}:
            return web.json_response({"ok": True, "status": existing["status"], "unchanged": True})
        status = "pending" if target.get("visibility") == "private" else "accepted"
        now = utcnow()
        try:
            result = await self.store.user_follows.update_one(
                {"follower_id": follower_id, "following_id": target_id, "status": {"$nin": ["pending", "accepted"]}},
                {"$set": {"status": status, "updated_at": now}, "$setOnInsert": {"follower_id": follower_id, "following_id": target_id, "created_at": now}},
                upsert=True,
            )
        except DuplicateKeyError:
            current = await self.store.user_follows.find_one({"follower_id": follower_id, "following_id": target_id})
            return web.json_response({"ok": True, "status": current.get("status", "pending"), "unchanged": True})
        if not (result.modified_count or result.upserted_id is not None):
            current = await self.store.user_follows.find_one({"follower_id": follower_id, "following_id": target_id})
            return web.json_response({"ok": True, "status": current.get("status", status), "unchanged": True})
        await self.store.notify(
            target_id, follower_id,
            "follow_request" if status == "pending" else "new_follower",
            {"follower_id": follower_id},
        )
        return web.json_response({"ok": True, "status": status})

    async def unfollow_user(self, request: web.Request):
        follower_id = int(request["telegram_user"]["id"])
        try:
            target_id = int(request.match_info["user_id"])
        except ValueError:
            raise APIError("invalid_user_id", 400)
        await self.store.user_follows.delete_one({"follower_id": follower_id, "following_id": target_id})
        return web.json_response({"ok": True})

    async def respond_follow(self, request: web.Request):
        target_id = int(request["telegram_user"]["id"])
        try:
            follower_id = int(request.match_info["user_id"])
        except ValueError:
            raise APIError("invalid_user_id", 400)
        data = await json_body(request)
        action = data.get("action")
        if action not in {"accept", "reject"}:
            raise APIError("invalid_action", 400)
        status = "accepted" if action == "accept" else "rejected"
        result = await self.store.user_follows.update_one(
            {"follower_id": follower_id, "following_id": target_id, "status": "pending"},
            {"$set": {"status": status, "updated_at": utcnow()}},
        )
        if not result.modified_count:
            raise APIError("follow_request_not_found", 404)
        if status == "accepted":
            await self.store.notify(follower_id, target_id, "follow_accepted", {"user_id": target_id})
        return web.json_response({"ok": True, "status": status})

    async def create_playlist(self, request: web.Request):
        user = request["telegram_user"]
        owner_id = int(user["id"])
        await self.store.ensure_profile(user)
        data = await json_body(request)
        name = clean_text(data.get("name"), 80, allow_empty=False)
        description = clean_text(data.get("description", ""), 500)
        visibility = data.get("visibility", "private")
        if visibility not in VALID_VISIBILITY:
            raise APIError("invalid_visibility", 400)
        now = utcnow()
        playlist_id = secrets.token_urlsafe(15)
        doc = {
            "_id": playlist_id,
            "owner_id": owner_id,
            "name": name,
            "description": description,
            "visibility": visibility,
            "cover_url": safe_https_url(data.get("cover_url")),
            "icon": clean_text(data.get("icon", "♫"), 8),
            "tracks": [],
            "track_count": 0,
            "collaborators": [],
            "version": 1,
            "created_at": now,
            "updated_at": now,
        }
        await self.store.playlists.insert_one(doc)
        return web.json_response({"ok": True, "playlist": await self.store.playlist_payload(doc, owner_id, include_tracks=True)}, status=201)




    async def _public_playlist_results(
        self,
        documents,
        user_id: int,
        limit: int,
        query: str = "",
    ) -> list[dict[str, Any]]:
        results = [
            await self.store.playlist_payload(doc, user_id)
            for doc in documents
        ]

        now = utcnow()

        def score(item):
            likes = int(item.get("like_count", 0))
            followers = int(item.get("follower_count", 0))
            tracks = int(item.get("track_count", 0))

            try:
                updated = datetime.fromisoformat(
                    item.get("updated_at") or now.isoformat()
                )
                if updated.tzinfo is None:
                    updated = updated.replace(tzinfo=timezone.utc)
            except (TypeError, ValueError):
                updated = now

            age_hours = max(
                0.0,
                (now - updated).total_seconds() / 3600,
            )

            engagement = (
                likes * 4
                + followers * 3
                + min(tracks, 100) * 0.25
            )

            popularity = engagement / (
                1 + (age_hours / 24) ** 0.65
            )

            if query:
                name = str(item.get("name", "")).lower()
                description = str(
                    item.get("description", "")
                ).lower()
                q = query.lower()

                if name.startswith(q):
                    popularity += 100
                elif q in name:
                    popularity += 60
                elif q in description:
                    popularity += 20

            return popularity

        results.sort(
            key=score,
            reverse=True,
        )

        return results[:limit]

    async def list_playlists(self, request: web.Request):
        user_id = int(request["telegram_user"]["id"])
        scope = request.query.get("scope", "mine")
        limit = page_size(request)

        if scope == "mine":
            cursor = self.store.playlists.find({
                "owner_id": user_id,
                "deleted_at": {"$exists": False},
            }).sort(
                "updated_at",
                DESCENDING,
            ).limit(limit)

            results = [
                await self.store.playlist_payload(doc, user_id)
                async for doc in cursor
            ]

        elif scope == "collaborating":
            cursor = self.store.playlists.find({
                "collaborators.user_id": user_id,
                "deleted_at": {"$exists": False},
            }).sort(
                "updated_at",
                DESCENDING,
            ).limit(limit)

            results = [
                await self.store.playlist_payload(doc, user_id)
                async for doc in cursor
            ]

        elif scope == "following":
            followed = [
                item["playlist_id"]
                async for item in self.store.playlist_follows.find({
                    "user_id": user_id,
                }).limit(200)
            ]

            cursor = self.store.playlists.find({
                "_id": {"$in": followed},
                "visibility": {"$in": ["public", "unlisted"]},
                "deleted_at": {"$exists": False},
            }).sort(
                "updated_at",
                DESCENDING,
            ).limit(limit)

            results = [
                await self.store.playlist_payload(doc, user_id)
                async for doc in cursor
            ]

        elif scope in {"discover", "trending", "fresh"}:
            cursor = self.store.playlists.find({
                "visibility": "public",
                "deleted_at": {"$exists": False},
            }).sort(
                "updated_at",
                DESCENDING,
            ).limit(
                min(100, max(30, limit * 4))
            )

            documents = [doc async for doc in cursor]

            if scope == "fresh":
                results = [
                    await self.store.playlist_payload(doc, user_id)
                    for doc in documents[:limit]
                ]
            else:
                results = await self._public_playlist_results(
                    documents,
                    user_id,
                    limit,
                )

        else:
            raise APIError("invalid_playlist_scope", 400)

        return web.json_response({
            "ok": True,
            "results": results,
        })


    async def get_playlist(self, request: web.Request):
        user_id = int(request["telegram_user"]["id"])
        doc = await self.store.get_playlist(request.match_info["playlist_id"])
        if not await self.store.can_view_playlist(doc, user_id):
            raise APIError("private_playlist", 403)
        return web.json_response({"ok": True, "playlist": await self.store.playlist_payload(doc, user_id, include_tracks=True)})



    async def update_playlist(self, request: web.Request):
        user_id = int(request["telegram_user"]["id"])
        doc = await self.store.get_playlist(request.match_info["playlist_id"])
        role = await self.store.require_playlist_role(doc, user_id, {"owner", "editor"})
        data = await json_body(request)
        allowed = {"name", "description", "cover_url", "icon", "visibility"}
        if not data or set(data) - allowed:
            raise APIError("invalid_playlist_fields", 400)
        update: dict[str, Any] = {"updated_at": utcnow()}
        if "name" in data:
            update["name"] = clean_text(data["name"], 80, allow_empty=False)
        if "description" in data:
            update["description"] = clean_text(data["description"], 500)
        if "cover_url" in data:
            update["cover_url"] = safe_https_url(data["cover_url"])
        if "icon" in data:
            update["icon"] = clean_text(data["icon"], 8)
        if "visibility" in data:
            if role != "owner":
                raise APIError("owner_only_visibility", 403)
            if data["visibility"] not in VALID_VISIBILITY:
                raise APIError("invalid_visibility", 400)
            update["visibility"] = data["visibility"]
        result = await self.store.playlists.update_one(
            {"_id": doc["_id"], "version": doc.get("version", 1), "deleted_at": {"$exists": False}},
            {"$set": update, "$inc": {"version": 1}},
        )
        if not result.modified_count:
            raise APIError("playlist_version_conflict", 409, "Playlist changed. Reload and try again.")
        fresh = await self.store.get_playlist(doc["_id"])
        return web.json_response({"ok": True, "playlist": await self.store.playlist_payload(fresh, user_id, include_tracks=True)})

    async def delete_playlist(self, request: web.Request):
        user_id = int(request["telegram_user"]["id"])
        doc = await self.store.get_playlist(request.match_info["playlist_id"])
        await self.store.require_playlist_role(doc, user_id, {"owner"})
        await self.store.playlists.update_one(
            {"_id": doc["_id"], "deleted_at": {"$exists": False}},
            {"$set": {"deleted_at": utcnow(), "updated_at": utcnow()}, "$inc": {"version": 1}},
        )
        return web.json_response({"ok": True, "deleted": True})

    async def add_track(self, request: web.Request):
        user_id = int(request["telegram_user"]["id"])
        doc = await self.store.get_playlist(request.match_info["playlist_id"])
        await self.store.require_playlist_role(doc, user_id, {"owner", "editor", "contributor"})
        data = await json_body(request)
        track_id = str(data.get("id", ""))
        if not VIDEO_ID_RE.fullmatch(track_id):
            raise APIError("invalid_track_id", 400)
        title = clean_text(data.get("title"), 160, allow_empty=False)
        artist = clean_text(data.get("artist", "Unknown artist"), 160)
        try:
            duration_sec = int(data.get("duration_sec", 0))
        except (TypeError, ValueError):
            raise APIError("invalid_duration", 400)
        if not 0 <= duration_sec <= 86400:
            raise APIError("invalid_duration", 400)
        track = {
            "id": track_id,
            "title": title,
            "artist": artist,
            "duration_sec": duration_sec,
            "thumbnail": safe_https_url(data.get("thumbnail")),
            "added_by": user_id,
            "added_at": utcnow().isoformat(),
        }
        result = await self.store.playlists.update_one(
            {
                "_id": doc["_id"],
                "tracks.id": {"$ne": track_id},
                "track_count": {"$lt": MAX_PLAYLIST_TRACKS},
                "deleted_at": {"$exists": False},
            },
            {"$push": {"tracks": track}, "$inc": {"track_count": 1, "version": 1}, "$set": {"updated_at": utcnow()}},
        )
        if not result.modified_count:
            latest = await self.store.get_playlist(doc["_id"])
            if any(item.get("id") == track_id for item in latest.get("tracks", [])):
                raise APIError("duplicate_track", 409, "This song is already in the playlist.")
            if int(latest.get("track_count", 0)) >= MAX_PLAYLIST_TRACKS:
                raise APIError("playlist_track_limit", 409)
            raise APIError("playlist_changed_retry", 409)
        fresh = await self.store.get_playlist(doc["_id"])
        return web.json_response({"ok": True, "playlist": await self.store.playlist_payload(fresh, user_id, include_tracks=True)}, status=201)

    async def remove_track(self, request: web.Request):
        user_id = int(request["telegram_user"]["id"])
        doc = await self.store.get_playlist(request.match_info["playlist_id"])
        await self.store.require_playlist_role(doc, user_id, {"owner", "editor"})
        track_id = request.match_info["track_id"]
        result = await self.store.playlists.update_one(
            {"_id": doc["_id"], "tracks.id": track_id, "deleted_at": {"$exists": False}},
            {"$pull": {"tracks": {"id": track_id}}, "$inc": {"track_count": -1, "version": 1}, "$set": {"updated_at": utcnow()}},
        )
        if not result.modified_count:
            raise APIError("track_not_found", 404)
        fresh = await self.store.get_playlist(doc["_id"])
        return web.json_response({"ok": True, "playlist": await self.store.playlist_payload(fresh, user_id, include_tracks=True)})

    async def reorder_tracks(self, request: web.Request):
        user_id = int(request["telegram_user"]["id"])
        doc = await self.store.get_playlist(request.match_info["playlist_id"])
        await self.store.require_playlist_role(doc, user_id, {"owner", "editor"})
        data = await json_body(request)
        order = data.get("track_ids")
        version = data.get("version")
        if not isinstance(order, list) or not all(isinstance(item, str) for item in order):
            raise APIError("invalid_track_order", 400)
        current_ids = [item["id"] for item in doc.get("tracks", [])]
        if len(order) != len(set(order)) or set(order) != set(current_ids):
            raise APIError("track_order_must_match_playlist", 400)
        if isinstance(version, bool) or not isinstance(version, int):
            raise APIError("playlist_version_required", 400)
        by_id = {item["id"]: item for item in doc.get("tracks", [])}
        ordered_tracks = [by_id[item] for item in order]
        result = await self.store.playlists.update_one(
            {"_id": doc["_id"], "version": version, "deleted_at": {"$exists": False}},
            {"$set": {"tracks": ordered_tracks, "updated_at": utcnow()}, "$inc": {"version": 1}},
        )
        if not result.modified_count:
            raise APIError("playlist_version_conflict", 409, "Playlist changed. Reload before reordering.")
        fresh = await self.store.get_playlist(doc["_id"])
        return web.json_response({"ok": True, "playlist": await self.store.playlist_payload(fresh, user_id, include_tracks=True)})

    async def follow_playlist(self, request: web.Request):
        user_id = int(request["telegram_user"]["id"])
        doc = await self.store.get_playlist(request.match_info["playlist_id"])
        if doc["visibility"] == "private":
            raise APIError("private_playlist_cannot_be_followed", 403)
        if doc["owner_id"] == user_id:
            raise APIError("cannot_follow_own_playlist", 400)
        try:
            await self.store.playlist_follows.insert_one({
                "user_id": user_id, "playlist_id": doc["_id"], "created_at": utcnow()
            })
            unchanged = False
            await self.store.notify(doc["owner_id"], user_id, "playlist_followed", {
                "playlist_id": doc["_id"], "playlist_name": doc["name"],
            })
        except DuplicateKeyError:
            unchanged = True
        return web.json_response({"ok": True, "followed": True, "unchanged": unchanged})

    async def unfollow_playlist(self, request: web.Request):
        user_id = int(request["telegram_user"]["id"])
        playlist_id = request.match_info["playlist_id"]
        await self.store.playlist_follows.delete_one({"user_id": user_id, "playlist_id": playlist_id})
        return web.json_response({"ok": True, "followed": False})

    async def like_playlist(self, request: web.Request):
        user_id = int(request["telegram_user"]["id"])
        doc = await self.store.get_playlist(request.match_info["playlist_id"])
        if not await self.store.can_view_playlist(doc, user_id):
            raise APIError("private_playlist", 403)
        try:
            await self.store.playlist_likes.insert_one({
                "user_id": user_id, "playlist_id": doc["_id"], "created_at": utcnow()
            })
            unchanged = False
        except DuplicateKeyError:
            unchanged = True
        return web.json_response({"ok": True, "liked": True, "unchanged": unchanged})

    async def unlike_playlist(self, request: web.Request):
        user_id = int(request["telegram_user"]["id"])
        playlist_id = request.match_info["playlist_id"]
        await self.store.playlist_likes.delete_one({"user_id": user_id, "playlist_id": playlist_id})
        return web.json_response({"ok": True, "liked": False})


    async def search_playlists(self, request: web.Request):
        user_id = int(request["telegram_user"]["id"])

        query = clean_text(
            request.query.get("q", ""),
            80,
            allow_empty=False,
        )

        if len(query) < 2:
            raise APIError("query_too_short", 400)

        pattern = re.compile(
            re.escape(query),
            re.IGNORECASE,
        )

        cursor = self.store.playlists.find({
            "visibility": "public",
            "deleted_at": {"$exists": False},
            "$or": [
                {"name": pattern},
                {"description": pattern},
                {"tracks.title": pattern},
                {"tracks.artist": pattern},
            ],
        }).sort(
            "updated_at",
            DESCENDING,
        ).limit(
            min(100, page_size(request) * 3)
        )

        documents = [doc async for doc in cursor]

        results = await self._public_playlist_results(
            documents,
            user_id,
            page_size(request),
            query=query,
        )

        return web.json_response({
            "ok": True,
            "results": results,
        })


    async def like_track(self, request: web.Request):
        user_id = int(request["telegram_user"]["id"])
        track_id = request.match_info["track_id"]
        if not VIDEO_ID_RE.fullmatch(track_id):
            raise APIError("invalid_track_id", 400)
        data = await json_body(request)
        track = {
            "id": track_id,
            "title": clean_text(data.get("title"), 160, allow_empty=False),
            "artist": clean_text(data.get("artist", "Unknown artist"), 160),
            "duration_sec": 0,
            "thumbnail": safe_https_url(data.get("thumbnail")),
        }
        try:
            track["duration_sec"] = int(data.get("duration_sec", 0))
        except (TypeError, ValueError):
            raise APIError("invalid_duration", 400)
        if not 0 <= track["duration_sec"] <= 86400:
            raise APIError("invalid_duration", 400)
        try:
            await self.store.track_likes.insert_one({
                "user_id": user_id, "track_id": track_id, "track": track, "created_at": utcnow()
            })
            unchanged = False
        except DuplicateKeyError:
            unchanged = True
        return web.json_response({"ok": True, "liked": True, "unchanged": unchanged})

    async def unlike_track(self, request: web.Request):
        user_id = int(request["telegram_user"]["id"])
        track_id = request.match_info["track_id"]
        if not VIDEO_ID_RE.fullmatch(track_id):
            raise APIError("invalid_track_id", 400)
        await self.store.track_likes.delete_one({"user_id": user_id, "track_id": track_id})
        return web.json_response({"ok": True, "liked": False})

    async def list_liked_tracks(self, request: web.Request):
        user_id = int(request["telegram_user"]["id"])
        cursor = self.store.track_likes.find({"user_id": user_id}).sort("created_at", DESCENDING).limit(page_size(request))
        results = [item.get("track", {}) async for item in cursor]
        return web.json_response({"ok": True, "results": results})

    async def invite_collaborator(self, request: web.Request):
        owner_id = int(request["telegram_user"]["id"])
        doc = await self.store.get_playlist(request.match_info["playlist_id"])
        await self.store.require_playlist_role(doc, owner_id, {"owner"})
        data = await json_body(request)
        try:
            invited_id = int(data.get("user_id"))
        except (TypeError, ValueError):
            raise APIError("invalid_user_id", 400)
        role = data.get("role", "editor")
        if role not in VALID_ROLES:
            raise APIError("invalid_collaborator_role", 400)
        if invited_id == owner_id or invited_id in [int(x["user_id"]) for x in doc.get("collaborators", [])]:
            raise APIError("already_playlist_member", 409)
        target = await self.store.profiles.find_one({"_id": invited_id})
        if not target:
            raise APIError("user_not_found", 404, "The user must open the Mini App before receiving an invitation.")
        now = utcnow()
        invite_id = secrets.token_urlsafe(16)
        try:
            await self.store.invitations.update_one(
                {"playlist_id": doc["_id"], "invited_user_id": invited_id, "status": {"$ne": "pending"}},
                {"$set": {"invite_id": invite_id, "invited_by": owner_id, "role": role, "status": "pending", "updated_at": now}, "$setOnInsert": {"created_at": now}},
                upsert=True,
            )
        except DuplicateKeyError:
            raise APIError("invitation_already_pending", 409)
        await self.store.notify(invited_id, owner_id, "collaboration_invitation", {
            "playlist_id": doc["_id"], "playlist_name": doc["name"], "invitation_id": invite_id, "role": role,
        })
        return web.json_response({"ok": True, "invitation_id": invite_id, "status": "pending"}, status=201)

    async def update_collaborator(self, request: web.Request):
        owner_id = int(request["telegram_user"]["id"])
        doc = await self.store.get_playlist(request.match_info["playlist_id"])
        await self.store.require_playlist_role(doc, owner_id, {"owner"})
        try:
            target_id = int(request.match_info["user_id"])
        except ValueError:
            raise APIError("invalid_user_id", 400)
        data = await json_body(request)
        role = data.get("role")
        if role not in VALID_ROLES:
            raise APIError("invalid_collaborator_role", 400)
        collaborator = next(
            (item for item in doc.get("collaborators", []) if int(item.get("user_id", 0)) == target_id),
            None,
        )
        if not collaborator:
            raise APIError("collaborator_not_found", 404)
        if collaborator.get("role") == role:
            return web.json_response({"ok": True, "user_id": target_id, "role": role, "unchanged": True})
        result = await self.store.playlists.update_one(
            {"_id": doc["_id"], "version": doc.get("version", 1), "collaborators.user_id": target_id, "deleted_at": {"$exists": False}},
            {"$set": {"collaborators.$.role": role, "updated_at": utcnow()}, "$inc": {"version": 1}},
        )
        if not result.modified_count:
            raise APIError("playlist_version_conflict", 409, "Playlist changed. Reload and try again.")
        await self.store.notify(target_id, owner_id, "collaboration_role_changed", {
            "playlist_id": doc["_id"], "playlist_name": doc["name"], "role": role,
        })
        return web.json_response({"ok": True, "user_id": target_id, "role": role})

    async def remove_collaborator(self, request: web.Request):
        owner_id = int(request["telegram_user"]["id"])
        doc = await self.store.get_playlist(request.match_info["playlist_id"])
        await self.store.require_playlist_role(doc, owner_id, {"owner"})
        try:
            target_id = int(request.match_info["user_id"])
        except ValueError:
            raise APIError("invalid_user_id", 400)
        result = await self.store.playlists.update_one(
            {"_id": doc["_id"], "collaborators.user_id": target_id, "deleted_at": {"$exists": False}},
            {"$pull": {"collaborators": {"user_id": target_id}}, "$set": {"updated_at": utcnow()}, "$inc": {"version": 1}},
        )
        if not result.modified_count:
            raise APIError("collaborator_not_found", 404)
        await self.store.notify(target_id, owner_id, "collaboration_removed", {
            "playlist_id": doc["_id"], "playlist_name": doc["name"],
        })
        return web.json_response({"ok": True, "removed": True})

    async def list_invitations(self, request: web.Request):
        user_id = int(request["telegram_user"]["id"])
        cursor = self.store.invitations.find({"invited_user_id": user_id, "status": "pending"}).sort("created_at", DESCENDING).limit(page_size(request))
        results = []
        async for invite in cursor:
            playlist = await self.store.playlists.find_one({"_id": invite["playlist_id"], "deleted_at": {"$exists": False}})
            actor = await self.store.profiles.find_one({"_id": invite["invited_by"]}) or {}
            if not playlist:
                continue
            results.append({
                "id": invite["invite_id"],
                "playlist_id": invite["playlist_id"],
                "playlist_name": playlist["name"],
                "invited_by": {"handle": actor.get("handle"), "display_name": actor.get("display_name", "Listener")},
                "role": invite["role"],
                "created_at": iso(invite.get("created_at")),
            })
        return web.json_response({"ok": True, "results": results})

    async def respond_invitation(self, request: web.Request):
        user_id = int(request["telegram_user"]["id"])
        invitation_id = request.match_info["invitation_id"]
        data = await json_body(request)
        action = data.get("action")
        if action not in {"accept", "reject"}:
            raise APIError("invalid_action", 400)
        invite = await self.store.invitations.find_one({"invite_id": invitation_id, "invited_user_id": user_id, "status": "pending"})
        if not invite:
            raise APIError("invitation_not_found", 404)
        playlist = await self.store.playlists.find_one({"_id": invite["playlist_id"], "deleted_at": {"$exists": False}})
        if not playlist:
            raise APIError("playlist_not_found", 404)
        new_status = "accepted" if action == "accept" else "rejected"
        result = await self.store.invitations.update_one(
            {"_id": invite["_id"], "status": "pending"},
            {"$set": {"status": new_status, "responded_at": utcnow(), "updated_at": utcnow()}},
        )
        if not result.modified_count:
            raise APIError("invitation_already_handled", 409)
        if action == "accept":
            await self.store.playlists.update_one(
                {"_id": playlist["_id"], "deleted_at": {"$exists": False}},
                {"$addToSet": {"collaborators": {"user_id": user_id, "role": invite["role"], "added_at": utcnow()}}, "$inc": {"version": 1}},
            )
        await self.store.notify(invite["invited_by"], user_id, f"collaboration_{new_status}", {
            "playlist_id": playlist["_id"], "playlist_name": playlist["name"], "role": invite["role"],
        })
        return web.json_response({"ok": True, "status": new_status})

    async def list_notifications(self, request: web.Request):
        user_id = int(request["telegram_user"]["id"])
        limit = page_size(request)
        cursor = self.store.notifications.find({"recipient_id": user_id}).sort("created_at", DESCENDING).limit(limit)
        results = []
        async for item in cursor:
            actor = await self.store.profiles.find_one({"_id": item.get("actor_id")}) if item.get("actor_id") else None
            results.append({
                "id": item["_id"],
                "type": item["type"],
                "payload": item.get("payload", {}),
                "actor": ({"handle": actor.get("handle"), "display_name": actor.get("display_name", "Listener"), "avatar_url": actor.get("avatar_url")} if actor else None),
                "read": bool(item.get("read_at")),
                "created_at": iso(item.get("created_at")),
            })
        unread = await self.store.notifications.count_documents({"recipient_id": user_id, "read_at": None})
        return web.json_response({"ok": True, "results": results, "unread_count": unread})

    async def mark_notification_read(self, request: web.Request):
        user_id = int(request["telegram_user"]["id"])
        result = await self.store.notifications.update_one(
            {"_id": request.match_info["notification_id"], "recipient_id": user_id, "read_at": None},
            {"$set": {"read_at": utcnow()}},
        )
        return web.json_response({"ok": True, "updated": bool(result.modified_count)})


def register_social_routes(application: web.Application, database) -> SocialStore:
    """Register social routes and initialize indexes during aiohttp startup."""
    store = SocialStore(database)
    api = SocialAPI(store)
    application.middlewares.append(social_error_middleware)
    api.register(application)

    async def on_startup(_app: web.Application) -> None:
        try:
            await store.ensure_indexes()
        except Exception:
            store.ready = False
            # A social-feature database outage must not take down group playback.
            logger.exception("Taalune social indexes could not be initialized.")

    application.on_startup.append(on_startup)
    application["social_store"] = store
    return store