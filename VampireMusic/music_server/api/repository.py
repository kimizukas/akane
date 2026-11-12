from __future__ import annotations

import re
import secrets

from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError

from VampireMusic import db

from .schemas import (
    PlaylistCreate,
    PlaylistUpdate,
    ProfileUpdate,
    TrackInput,
)


MAX_PLAYLISTS_PER_USER = 200
MAX_PLAYLIST_TRACKS = 1000
MAX_COLLABORATORS = 20
MAX_HISTORY_ITEMS = 100
MAX_PAGE_SIZE = 50

VALID_ROLES = {
    "editor",
    "contributor",
    "viewer",
}

HANDLE_PATTERN = re.compile(r"^[a-z0-9_]{3,24}$")


class RepositoryError(Exception):
    def __init__(
        self,
        code: str,
        status: int = 400,
        message: str | None = None,
    ):
        super().__init__(message or code)
        self.code = code
        self.status = status
        self.message = message or code.replace("_", " ")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def clean_text(
    value: Any,
    limit: int,
    *,
    allow_empty: bool = True,
) -> str:
    if not isinstance(value, str):
        raise RepositoryError("invalid_text")

    value = "".join(
        character
        for character in value.strip()
        if character >= " " or character in "\n\t"
    )

    if len(value) > limit:
        raise RepositoryError("text_too_long")

    if not allow_empty and not value:
        raise RepositoryError("text_required")

    return value


def clean_https_url(
    value: str | None,
    *,
    allow_local: bool = True,
) -> str | None:
    if value in (None, ""):
        return None

    if not isinstance(value, str) or len(value) > 2048:
        raise RepositoryError("invalid_url")

    if allow_local and value.startswith("/media/covers/"):
        filename = value.rsplit("/", 1)[-1]

        if not re.fullmatch(r"[a-f0-9]{32}\.webp", filename):
            raise RepositoryError("invalid_local_media_path")

        return value

    parsed = urlparse(value)

    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise RepositoryError("https_url_required")

    return value


def page_limit(value: Any, default: int = 20) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default

    return max(1, min(number, MAX_PAGE_SIZE))


def profile_public_payload(
    profile: dict[str, Any],
    viewer_id: int,
) -> dict[str, Any]:
    user_id = int(profile["_id"])

    return {
        "user_id": user_id,
        "handle": profile.get("handle", f"listener_{user_id}"),
        "display_name": profile.get("display_name", "Listener"),
        "bio": profile.get("bio", ""),
        "avatar_url": profile.get("avatar_url"),
        "visibility": profile.get("visibility", "public"),
        "discoverable": bool(profile.get("discoverable", True)),
        "is_self": user_id == int(viewer_id),
    }


class MusicRepository:
    """
    MongoDB repository for the Mini App.

    Existing collection names from the old social API are retained so
    the new FastAPI backend does not silently create a parallel library.
    """

    def __init__(self):
        database = db.db

        self.profiles = database.music_profiles
        self.playlists = database.music_playlists
        self.user_follows = database.music_user_follows
        self.playlist_follows = database.music_playlist_follows
        self.playlist_likes = database.music_playlist_likes
        self.listening_history = database.music_listening_history
        self.track_likes = database.music_track_likes
        self.invitations = database.music_invitations
        self.notifications = database.music_notifications
        self.settings = database.music_settings
        self.sessions = database.music_sessions
        self.ai_cache = database.music_ai_cache
        self.audit_log = database.music_audit_log

        self.ready = False

    async def ensure_indexes(self) -> None:
        await self.profiles.create_index(
            [("handle", ASCENDING)],
            unique=True,
            name="uniq_music_handle",
        )

        await self.profiles.create_index(
            [
                ("discoverable", ASCENDING),
                ("handle", ASCENDING),
            ],
            name="music_profile_discovery",
        )

        await self.playlists.create_index(
            [
                ("owner_id", ASCENDING),
                ("created_at", DESCENDING),
            ],
            name="music_owner_playlists",
        )

        await self.playlists.create_index(
            [
                ("visibility", ASCENDING),
                ("updated_at", DESCENDING),
            ],
            name="music_public_playlists",
        )

        await self.user_follows.create_index(
            [
                ("follower_id", ASCENDING),
                ("following_id", ASCENDING),
            ],
            unique=True,
            name="uniq_music_user_follow",
        )

        await self.user_follows.create_index(
            [
                ("following_id", ASCENDING),
                ("status", ASCENDING),
            ],
            name="music_follow_requests",
        )

        await self.playlist_follows.create_index(
            [
                ("user_id", ASCENDING),
                ("playlist_id", ASCENDING),
            ],
            unique=True,
            name="uniq_music_playlist_follow",
        )

        await self.playlist_likes.create_index(
            [
                ("user_id", ASCENDING),
                ("playlist_id", ASCENDING),
            ],
            unique=True,
            name="uniq_music_playlist_like",
        )

        await self.track_likes.create_index(
            [
                ("user_id", ASCENDING),
                ("track_id", ASCENDING),
            ],
            unique=True,
            name="uniq_music_track_like",
        )

        await self.track_likes.create_index(
            [
                ("user_id", ASCENDING),
                ("created_at", DESCENDING),
            ],
            name="music_liked_tracks",
        )

        await self.invitations.create_index(
            [
                ("playlist_id", ASCENDING),
                ("invited_user_id", ASCENDING),
            ],
            unique=True,
            name="uniq_music_invitation_target",
        )

        await self.invitations.create_index(
            [
                ("invited_user_id", ASCENDING),
                ("status", ASCENDING),
                ("created_at", DESCENDING),
            ],
            name="music_invitation_inbox",
        )

        await self.notifications.create_index(
            [
                ("recipient_id", ASCENDING),
                ("created_at", DESCENDING),
            ],
            name="music_notification_inbox",
        )

        # Older notifications do not have dedupe_key. Sparse indexing
        # allows existing documents to remain valid.
        await self.notifications.create_index(
            [("dedupe_key", ASCENDING)],
            unique=True,
            sparse=True,
            name="uniq_music_notification_dedupe",
        )

        await self.listening_history.create_index(
            [("updated_at", DESCENDING)],
            name="music_listening_history_updated",
        )

        await self.sessions.create_index(
            [
                ("user_id", ASCENDING),
                ("revoked", ASCENDING),
            ],
            name="music_sessions_user",
        )

        await self.sessions.create_index(
            [("expires_at", ASCENDING)],
            name="music_sessions_expiry",
        )

        await self.ai_cache.create_index(
            [("expires_at", ASCENDING)],
            name="music_ai_cache_expiry",
        )

        await self.audit_log.create_index(
            [("created_at", DESCENDING)],
            name="music_audit_recent",
        )

        self.ready = True

    async def ensure_profile(
        self,
        user: dict[str, Any],
    ) -> dict[str, Any]:
        user_id = int(user["id"])

        existing = await self.profiles.find_one({
            "_id": user_id,
        })

        if existing:
            await self.profiles.update_one(
                {"_id": user_id},
                {
                    "$set": {
                        "telegram_username": user.get("username"),
                        "last_seen_at": utcnow(),
                    }
                },
            )

            fresh = await self.profiles.find_one({
                "_id": user_id,
            })

            return fresh or existing

        raw_handle = str(
            user.get("username")
            or f"listener_{user_id}"
        ).lower().lstrip("@")

        if HANDLE_PATTERN.fullmatch(raw_handle):
            handle = raw_handle
        else:
            handle = f"listener_{user_id}"

        now = utcnow()

        profile = {
            "_id": user_id,
            "handle": handle,
            "display_name": clean_text(
                user.get("first_name") or "Listener",
                48,
                allow_empty=False,
            ),
            "bio": "",
            "avatar_url": clean_https_url(
                user.get("photo_url"),
                allow_local=False,
            ),
            "telegram_username": user.get("username"),
            "visibility": "public",
            "discoverable": True,
            "banned": False,
            "created_at": now,
            "updated_at": now,
            "last_seen_at": now,
        }

        try:
            await self.profiles.insert_one(profile)
            return profile

        except DuplicateKeyError:
            existing = await self.profiles.find_one({
                "_id": user_id,
            })

            if existing:
                return existing

            # Telegram usernames can collide with an existing custom handle.
            profile["handle"] = f"listener_{user_id}"

            await self.profiles.insert_one(profile)
            return profile

    async def get_profile(
        self,
        user_id: int,
    ) -> dict[str, Any] | None:
        return await self.profiles.find_one({
            "_id": int(user_id),
        })

    async def get_profile_payload(
        self,
        profile: dict[str, Any],
        viewer_id: int,
    ) -> dict[str, Any]:
        target_id = int(profile["_id"])

        relation = None

        if target_id != viewer_id:
            relation = await self.user_follows.find_one({
                "follower_id": int(viewer_id),
                "following_id": target_id,
            })

        followers = await self.user_follows.count_documents({
            "following_id": target_id,
            "status": "accepted",
        })

        following = await self.user_follows.count_documents({
            "follower_id": target_id,
            "status": "accepted",
        })

        result = profile_public_payload(
            profile,
            viewer_id,
        )

        result.update({
            "followers": followers,
            "following": following,
            "follow_state": (
                relation.get("status")
                if relation
                else None
            ),
        })

        return result

    async def update_profile(
        self,
        user_id: int,
        patch: ProfileUpdate,
    ) -> dict[str, Any]:
        update = patch.model_dump(
            exclude_unset=True,
        )

        if not update:
            raise RepositoryError("empty_profile_update")

        if "handle" in update:
            update["handle"] = clean_text(
                update["handle"],
                24,
                allow_empty=False,
            ).lower()

            if not HANDLE_PATTERN.fullmatch(update["handle"]):
                raise RepositoryError("invalid_handle")

        if "display_name" in update:
            update["display_name"] = clean_text(
                update["display_name"],
                48,
                allow_empty=False,
            )

        if "bio" in update:
            update["bio"] = clean_text(
                update["bio"],
                160,
            )

        if "avatar_url" in update:
            update["avatar_url"] = clean_https_url(
                update["avatar_url"],
            )

        update["updated_at"] = utcnow()

        try:
            await self.profiles.update_one(
                {"_id": int(user_id)},
                {"$set": update},
            )

        except DuplicateKeyError as exc:
            raise RepositoryError(
                "handle_already_taken",
                409,
            ) from exc

        profile = await self.profiles.find_one({
            "_id": int(user_id),
        })

        if not profile:
            raise RepositoryError("profile_not_found", 404)

        return profile

    async def get_playlist(
        self,
        playlist_id: str,
    ) -> dict[str, Any]:
        if not isinstance(playlist_id, str):
            raise RepositoryError("playlist_not_found", 404)

        if not 8 <= len(playlist_id) <= 64:
            raise RepositoryError("playlist_not_found", 404)

        playlist = await self.playlists.find_one({
            "_id": playlist_id,
            "deleted_at": {"$exists": False},
        })

        if not playlist:
            raise RepositoryError("playlist_not_found", 404)

        return playlist

    @staticmethod
    def role_for(
        playlist: dict[str, Any],
        user_id: int,
    ) -> str | None:
        user_id = int(user_id)

        if int(playlist["owner_id"]) == user_id:
            return "owner"

        for collaborator in playlist.get("collaborators", []):
            if int(collaborator.get("user_id", 0)) == user_id:
                return str(collaborator.get("role"))

        return None

    def require_role(
        self,
        playlist: dict[str, Any],
        user_id: int,
        allowed: set[str],
    ) -> str:
        role = self.role_for(playlist, user_id)

        if role not in allowed:
            raise RepositoryError(
                "permission_denied",
                403,
            )

        return role

    def can_view(
        self,
        playlist: dict[str, Any],
        user_id: int,
    ) -> bool:
        visibility = playlist.get("visibility")

        if visibility in {"public", "unlisted"}:
            return True

        return self.role_for(playlist, user_id) is not None

    async def playlist_payload(
        self,
        playlist: dict[str, Any],
        viewer_id: int,
        *,
        include_tracks: bool = False,
    ) -> dict[str, Any]:
        owner = await self.profiles.find_one({
            "_id": int(playlist["owner_id"]),
        }) or {}

        playlist_id = playlist["_id"]

        result = {
            "id": playlist_id,
            "name": playlist.get("name", "Untitled playlist"),
            "description": playlist.get("description", ""),
            "visibility": playlist.get("visibility", "private"),
            "owner": {
                "user_id": int(playlist["owner_id"]),
                "handle": owner.get("handle"),
                "display_name": owner.get(
                    "display_name",
                    "Listener",
                ),
                "avatar_url": owner.get("avatar_url"),
            },
            "role": self.role_for(
                playlist,
                viewer_id,
            ),
            "track_count": int(
                playlist.get(
                    "track_count",
                    len(playlist.get("tracks", [])),
                )
            ),
            "version": int(playlist.get("version", 1)),
            "cover_url": playlist.get("cover_url"),
            "icon": playlist.get("icon", "♫"),
            "created_at": (
                playlist["created_at"].isoformat()
                if isinstance(playlist.get("created_at"), datetime)
                else None
            ),
            "updated_at": (
                playlist["updated_at"].isoformat()
                if isinstance(playlist.get("updated_at"), datetime)
                else None
            ),
            "like_count": await self.playlist_likes.count_documents({
                "playlist_id": playlist_id,
            }),
            "follower_count": await self.playlist_follows.count_documents({
                "playlist_id": playlist_id,
            }),
            "liked": bool(
                await self.playlist_likes.find_one({
                    "playlist_id": playlist_id,
                    "user_id": int(viewer_id),
                })
            ),
            "followed": bool(
                await self.playlist_follows.find_one({
                    "playlist_id": playlist_id,
                    "user_id": int(viewer_id),
                })
            ),
        }

        if include_tracks:
            result["tracks"] = [
                {
                    key: value
                    for key, value in track.items()
                    if key != "added_by"
                }
                for track in playlist.get("tracks", [])
            ]

            collaborators = []

            if self.role_for(playlist, viewer_id):
                for item in playlist.get("collaborators", []):
                    collaborator_profile = await self.profiles.find_one({
                        "_id": int(item["user_id"]),
                    }) or {}

                    collaborators.append({
                        "user_id": int(item["user_id"]),
                        "role": item.get("role"),
                        "handle": collaborator_profile.get("handle"),
                        "display_name": collaborator_profile.get(
                            "display_name",
                            "Listener",
                        ),
                        "avatar_url": collaborator_profile.get("avatar_url"),
                    })

            result["collaborators"] = collaborators

        return result

    async def create_playlist(
        self,
        user_id: int,
        data: PlaylistCreate,
    ) -> dict[str, Any]:
        count = await self.playlists.count_documents({
            "owner_id": int(user_id),
            "deleted_at": {"$exists": False},
        })

        if count >= MAX_PLAYLISTS_PER_USER:
            raise RepositoryError(
                "playlist_limit_reached",
                409,
            )

        name = clean_text(
            data.name,
            60,
            allow_empty=False,
        )

        description = clean_text(
            data.description,
            300,
        )

        now = utcnow()

        document = {
            "_id": secrets.token_urlsafe(18),
            "owner_id": int(user_id),
            "name": name,
            "description": description,
            "visibility": data.visibility,
            "cover_url": clean_https_url(data.cover_url),
            "icon": clean_text(data.icon, 8),
            "tracks": [],
            "track_count": 0,
            "collaborators": [],
            "version": 1,
            "created_at": now,
            "updated_at": now,
        }

        await self.playlists.insert_one(document)

        return await self.playlist_payload(
            document,
            int(user_id),
            include_tracks=True,
        )

    async def update_playlist(
        self,
        playlist: dict[str, Any],
        user_id: int,
        patch: PlaylistUpdate,
    ) -> dict[str, Any]:
        role = self.require_role(
            playlist,
            user_id,
            {"owner", "editor"},
        )

        update = patch.model_dump(
            exclude_unset=True,
            exclude={"version"},
        )

        if not update:
            raise RepositoryError("empty_playlist_update")

        if "name" in update:
            update["name"] = clean_text(
                update["name"],
                60,
                allow_empty=False,
            )

        if "description" in update:
            update["description"] = clean_text(
                update["description"],
                300,
            )

        if "cover_url" in update:
            update["cover_url"] = clean_https_url(
                update["cover_url"],
            )

        if "icon" in update:
            update["icon"] = clean_text(
                update["icon"],
                8,
            )

        if "visibility" in update and role != "owner":
            raise RepositoryError(
                "owner_only_visibility",
                403,
            )

        update["updated_at"] = utcnow()

        result = await self.playlists.update_one(
            {
                "_id": playlist["_id"],
                "version": patch.version,
                "deleted_at": {"$exists": False},
            },
            {
                "$set": update,
                "$inc": {"version": 1},
            },
        )

        if not result.modified_count:
            raise RepositoryError(
                "playlist_version_conflict",
                409,
                "Playlist changed. Reload its latest version.",
            )

        fresh = await self.get_playlist(playlist["_id"])

        return await self.playlist_payload(
            fresh,
            user_id,
            include_tracks=True,
        )

    async def delete_playlist(
        self,
        playlist: dict[str, Any],
        user_id: int,
    ) -> None:
        self.require_role(
            playlist,
            user_id,
            {"owner"},
        )

        now = utcnow()

        result = await self.playlists.update_one(
            {
                "_id": playlist["_id"],
                "deleted_at": {"$exists": False},
            },
            {
                "$set": {
                    "deleted_at": now,
                    "updated_at": now,
                },
                "$inc": {"version": 1},
            },
        )

        if not result.modified_count:
            raise RepositoryError(
                "playlist_not_found",
                404,
            )

    async def add_track(
        self,
        playlist: dict[str, Any],
        user_id: int,
        track: TrackInput,
    ) -> dict[str, Any]:
        self.require_role(
            playlist,
            user_id,
            {"owner", "editor", "contributor"},
        )

        existing = await self.playlists.find_one({
            "_id": playlist["_id"],
            "tracks.id": track.id,
        })

        if existing:
            raise RepositoryError(
                "duplicate_track",
                409,
            )

        if int(playlist.get("track_count", 0)) >= MAX_PLAYLIST_TRACKS:
            raise RepositoryError(
                "playlist_track_limit",
                409,
            )

        item = {
            "id": track.id,
            "title": clean_text(
                track.title,
                160,
                allow_empty=False,
            ),
            "artist": clean_text(
                track.artist,
                160,
            ) or "Unknown artist",
            "duration_sec": int(track.duration_sec),
            "thumbnail": clean_https_url(track.thumbnail),
            "added_by": int(user_id),
            "added_at": utcnow().isoformat(),
        }

        result = await self.playlists.update_one(
            {
                "_id": playlist["_id"],
                "tracks.id": {"$ne": track.id},
                "track_count": {"$lt": MAX_PLAYLIST_TRACKS},
                "deleted_at": {"$exists": False},
            },
            {
                "$push": {"tracks": item},
                "$inc": {
                    "track_count": 1,
                    "version": 1,
                },
                "$set": {"updated_at": utcnow()},
            },
        )

        if not result.modified_count:
            raise RepositoryError(
                "playlist_changed_retry",
                409,
            )

        fresh = await self.get_playlist(playlist["_id"])

        return await self.playlist_payload(
            fresh,
            user_id,
            include_tracks=True,
        )

    async def remove_track(
        self,
        playlist: dict[str, Any],
        user_id: int,
        track_id: str,
    ) -> dict[str, Any]:
        self.require_role(
            playlist,
            user_id,
            {"owner", "editor"},
        )

        result = await self.playlists.update_one(
            {
                "_id": playlist["_id"],
                "tracks.id": track_id,
                "deleted_at": {"$exists": False},
            },
            {
                "$pull": {
                    "tracks": {"id": track_id},
                },
                "$inc": {
                    "track_count": -1,
                    "version": 1,
                },
                "$set": {"updated_at": utcnow()},
            },
        )

        if not result.modified_count:
            raise RepositoryError(
                "track_not_found",
                404,
            )

        fresh = await self.get_playlist(playlist["_id"])

        return await self.playlist_payload(
            fresh,
            user_id,
            include_tracks=True,
        )

    async def reorder_tracks(
        self,
        playlist: dict[str, Any],
        user_id: int,
        track_ids: list[str],
        version: int,
    ) -> dict[str, Any]:
        self.require_role(
            playlist,
            user_id,
            {"owner", "editor"},
        )

        current_tracks = playlist.get("tracks", [])

        current_ids = [
            str(item["id"])
            for item in current_tracks
        ]

        if len(track_ids) != len(set(track_ids)):
            raise RepositoryError("duplicate_track_order")

        if set(track_ids) != set(current_ids):
            raise RepositoryError(
                "track_order_must_match_playlist",
            )

        by_id = {
            str(item["id"]): item
            for item in current_tracks
        }

        ordered_tracks = [
            by_id[track_id]
            for track_id in track_ids
        ]

        result = await self.playlists.update_one(
            {
                "_id": playlist["_id"],
                "version": int(version),
                "deleted_at": {"$exists": False},
            },
            {
                "$set": {
                    "tracks": ordered_tracks,
                    "updated_at": utcnow(),
                },
                "$inc": {"version": 1},
            },
        )

        if not result.modified_count:
            raise RepositoryError(
                "playlist_version_conflict",
                409,
            )

        fresh = await self.get_playlist(playlist["_id"])

        return await self.playlist_payload(
            fresh,
            user_id,
            include_tracks=True,
        )

    async def list_playlists(
        self,
        user_id: int,
        scope: str,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        limit = page_limit(limit)

        if scope == "mine":
            query = {
                "owner_id": int(user_id),
                "deleted_at": {"$exists": False},
            }

        elif scope == "collaborating":
            query = {
                "collaborators.user_id": int(user_id),
                "deleted_at": {"$exists": False},
            }

        elif scope == "following":
            followed_ids = [
                item["playlist_id"]
                async for item in self.playlist_follows.find({
                    "user_id": int(user_id),
                }).limit(200)
            ]

            query = {
                "_id": {"$in": followed_ids},
                "visibility": {"$in": ["public", "unlisted"]},
                "deleted_at": {"$exists": False},
            }

        elif scope in {"discover", "trending", "fresh"}:
            query = {
                "visibility": "public",
                "deleted_at": {"$exists": False},
            }

        else:
            raise RepositoryError(
                "invalid_playlist_scope",
            )

        sort = (
            [("created_at", DESCENDING)]
            if scope == "fresh"
            else [("updated_at", DESCENDING)]
        )

        documents = [
            document
            async for document in self.playlists.find(query)
            .sort(sort)
            .limit(limit)
        ]

        results = []

        for document in documents:
            results.append(
                await self.playlist_payload(
                    document,
                    int(user_id),
                )
            )

        if scope == "trending":
            results.sort(
                key=lambda item: (
                    int(item.get("like_count", 0)) * 4
                    + int(item.get("follower_count", 0)) * 3
                    + int(item.get("track_count", 0))
                ),
                reverse=True,
            )

        return results

    async def search_playlists(
        self,
        user_id: int,
        query: str,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        query = clean_text(
            query,
            80,
            allow_empty=False,
        )

        if len(query) < 2:
            raise RepositoryError(
                "query_too_short",
            )

        pattern = re.compile(
            re.escape(query),
            re.IGNORECASE,
        )

        cursor = self.playlists.find({
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
            page_limit(limit),
        )

        documents = [document async for document in cursor]
        results = []

        for document in documents:
            results.append(
                await self.playlist_payload(
                    document,
                    user_id,
                )
            )

        return results

    async def like_track(
        self,
        user_id: int,
        track: TrackInput,
    ) -> bool:
        document = {
            "user_id": int(user_id),
            "track_id": track.id,
            "track": track.model_dump(),
            "created_at": utcnow(),
        }

        try:
            await self.track_likes.insert_one(document)
            return True

        except DuplicateKeyError:
            return False

    async def unlike_track(
        self,
        user_id: int,
        track_id: str,
    ) -> bool:
        result = await self.track_likes.delete_one({
            "user_id": int(user_id),
            "track_id": track_id,
        })

        return bool(result.deleted_count)

    async def liked_tracks(
        self,
        user_id: int,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        cursor = self.track_likes.find({
            "user_id": int(user_id),
        }).sort(
            "created_at",
            DESCENDING,
        ).limit(
            page_limit(limit),
        )

        return [
            item.get("track", {})
            async for item in cursor
        ]

    async def record_history(
        self,
        user_id: int,
        track: TrackInput,
        *,
        played_seconds: int,
    ) -> bool:
        duration = int(track.duration_sec)

        if duration > 0:
            required = min(30, max(1, duration // 2))
        else:
            required = 30

        if int(played_seconds) < required:
            return False

        now = utcnow()

        recent = await self.listening_history.find_one({
            "_id": int(user_id),
            "items.id": track.id,
        })

        if recent:
            latest = next(
                (
                    item
                    for item in recent.get("items", [])
                    if item.get("id") == track.id
                ),
                None,
            )

            if latest:
                try:
                    previous = datetime.fromisoformat(
                        latest["played_at"]
                    )

                    if previous.tzinfo is None:
                        previous = previous.replace(
                            tzinfo=timezone.utc,
                        )

                    if (
                        now - previous
                    ).total_seconds() < 30:
                        return False

                except (TypeError, ValueError, KeyError):
                    pass

        item = {
            "id": track.id,
            "title": track.title,
            "artist": track.artist,
            "duration_sec": duration,
            "thumbnail": track.thumbnail,
            "played_at": now.isoformat(),
        }

        await self.listening_history.update_one(
            {"_id": int(user_id)},
            {
                "$push": {
                    "items": {
                        "$each": [item],
                        "$position": 0,
                        "$slice": MAX_HISTORY_ITEMS,
                    }
                },
                "$set": {
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "created_at": now,
                },
            },
            upsert=True,
        )

        return True

    async def get_history(
        self,
        user_id: int,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        document = await self.listening_history.find_one({
            "_id": int(user_id),
        }) or {}

        return document.get("items", [])[:page_limit(limit)]

    async def follow_playlist(
        self,
        user_id: int,
        playlist: dict[str, Any],
    ) -> bool:
        if playlist.get("visibility") == "private":
            raise RepositoryError(
                "private_playlist_cannot_be_followed",
                403,
            )

        if int(playlist["owner_id"]) == int(user_id):
            raise RepositoryError("cannot_follow_own_playlist")

        try:
            await self.playlist_follows.insert_one({
                "user_id": int(user_id),
                "playlist_id": playlist["_id"],
                "created_at": utcnow(),
            })

            await self.notify(
                int(playlist["owner_id"]),
                int(user_id),
                "playlist_followed",
                {
                    "playlist_id": playlist["_id"],
                    "playlist_name": playlist["name"],
                },
            )

            return True

        except DuplicateKeyError:
            return False

    async def unfollow_playlist(
        self,
        user_id: int,
        playlist_id: str,
    ) -> bool:
        result = await self.playlist_follows.delete_one({
            "user_id": int(user_id),
            "playlist_id": playlist_id,
        })

        return bool(result.deleted_count)

    async def like_playlist(
        self,
        user_id: int,
        playlist: dict[str, Any],
    ) -> bool:
        if not self.can_view(playlist, user_id):
            raise RepositoryError("private_playlist", 403)

        try:
            await self.playlist_likes.insert_one({
                "user_id": int(user_id),
                "playlist_id": playlist["_id"],
                "created_at": utcnow(),
            })

            return True

        except DuplicateKeyError:
            return False

    async def unlike_playlist(
        self,
        user_id: int,
        playlist_id: str,
    ) -> bool:
        result = await self.playlist_likes.delete_one({
            "user_id": int(user_id),
            "playlist_id": playlist_id,
        })

        return bool(result.deleted_count)

    async def notify(
        self,
        recipient_id: int,
        actor_id: int | None,
        kind: str,
        payload: dict[str, Any],
        *,
        dedupe_key: str | None = None,
    ) -> bool:
        if actor_id is not None and int(recipient_id) == int(actor_id):
            return False

        now = utcnow()

        document = {
            "_id": secrets.token_urlsafe(18),
            "recipient_id": int(recipient_id),
            "actor_id": (
                int(actor_id)
                if actor_id is not None
                else None
            ),
            "type": kind,
            "payload": payload,
            "read_at": None,
            "created_at": now,
        }

        if dedupe_key:
            document["dedupe_key"] = dedupe_key

        try:
            await self.notifications.insert_one(document)
            return True

        except DuplicateKeyError:
            return False

    async def list_notifications(
        self,
        user_id: int,
        limit: int = 30,
    ) -> tuple[list[dict[str, Any]], int]:
        cursor = self.notifications.find({
            "recipient_id": int(user_id),
        }).sort(
            "created_at",
            DESCENDING,
        ).limit(
            page_limit(limit),
        )

        results = []

        async for item in cursor:
            actor = None

            if item.get("actor_id"):
                actor = await self.profiles.find_one({
                    "_id": int(item["actor_id"]),
                })

            results.append({
                "id": item["_id"],
                "type": item["type"],
                "payload": item.get("payload", {}),
                "actor": (
                    {
                        "handle": actor.get("handle"),
                        "display_name": actor.get(
                            "display_name",
                            "Listener",
                        ),
                        "avatar_url": actor.get("avatar_url"),
                    }
                    if actor
                    else None
                ),
                "read": bool(item.get("read_at")),
                "created_at": (
                    item["created_at"].isoformat()
                    if isinstance(item.get("created_at"), datetime)
                    else None
                ),
            })

        unread = await self.notifications.count_documents({
            "recipient_id": int(user_id),
            "read_at": None,
        })

        return results, unread

    async def mark_notification_read(
        self,
        user_id: int,
        notification_id: str,
    ) -> bool:
        result = await self.notifications.update_one(
            {
                "_id": notification_id,
                "recipient_id": int(user_id),
                "read_at": None,
            },
            {
                "$set": {
                    "read_at": utcnow(),
                }
            },
        )

        return bool(result.modified_count)

    async def mark_all_notifications_read(
        self,
        user_id: int,
    ) -> int:
        result = await self.notifications.update_many(
            {
                "recipient_id": int(user_id),
                "read_at": None,
            },
            {
                "$set": {
                    "read_at": utcnow(),
                }
            },
        )

        return int(result.modified_count)

    async def get_settings(
        self,
        user_id: int,
    ) -> dict[str, Any]:
        existing = await self.settings.find_one({
            "_id": int(user_id),
        })

        if existing:
            existing.pop("_id", None)
            return existing

        defaults = {
            "theme": "dark",
            "language": "en",
            "audio_quality": "auto",
            "data_saver": False,
            "profile_visibility": "public",
            "show_activity": True,
            "personalized_recommendations": True,
            "notification_preferences": {
                "collaboration": True,
                "playlist_updates": True,
                "group_sessions": True,
                "system": True,
            },
        }

        await self.settings.update_one(
            {"_id": int(user_id)},
            {
                "$setOnInsert": {
                    **defaults,
                    "created_at": utcnow(),
                }
            },
            upsert=True,
        )

        return defaults

    async def update_settings(
        self,
        user_id: int,
        update: dict[str, Any],
    ) -> dict[str, Any]:
        allowed = {
            "theme",
            "language",
            "audio_quality",
            "data_saver",
            "profile_visibility",
            "show_activity",
            "personalized_recommendations",
            "notification_preferences",
        }

        clean_update = {
            key: value
            for key, value in update.items()
            if key in allowed
        }

        if clean_update:
            clean_update["updated_at"] = utcnow()

            await self.settings.update_one(
                {"_id": int(user_id)},
                {"$set": clean_update},
                upsert=True,
            )

        return await self.get_settings(user_id)

    async def search_people(
        self,
        query: str,
        viewer_id: int,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        query = clean_text(
            query,
            60,
            allow_empty=False,
        )

        if len(query) < 2:
            raise RepositoryError("query_too_short")

        pattern = re.compile(
            re.escape(query),
            re.IGNORECASE,
        )

        cursor = self.profiles.find({
            "_id": {"$ne": int(viewer_id)},
            "discoverable": True,
            "banned": {"$ne": True},
            "$or": [
                {"handle": pattern},
                {"display_name": pattern},
                {"telegram_username": pattern},
            ],
        }).limit(
            page_limit(limit),
        )

        results = []

        async for profile in cursor:
            results.append(
                await self.get_profile_payload(
                    profile,
                    int(viewer_id),
                )
            )

        return results

    async def follow_user(
        self,
        follower_id: int,
        target_id: int,
    ) -> bool:
        if follower_id == target_id:
            raise RepositoryError("cannot_follow_self")

        target = await self.profiles.find_one({
            "_id": int(target_id),
            "banned": {"$ne": True},
        })

        if not target:
            raise RepositoryError("user_not_found", 404)

        status_value = (
            "pending"
            if target.get("visibility") == "private"
            else "accepted"
        )

        try:
            await self.user_follows.insert_one({
                "follower_id": int(follower_id),
                "following_id": int(target_id),
                "status": status_value,
                "created_at": utcnow(),
            })

            if status_value == "pending":
                await self.notify(
                    target_id,
                    follower_id,
                    "follow_request",
                    {"user_id": follower_id},
                )

            return True

        except DuplicateKeyError:
            return False

    async def unfollow_user(
        self,
        follower_id: int,
        target_id: int,
    ) -> bool:
        result = await self.user_follows.delete_one({
            "follower_id": int(follower_id),
            "following_id": int(target_id),
        })

        return bool(result.deleted_count)

    async def respond_follow(
        self,
        target_id: int,
        follower_id: int,
        accept: bool,
    ) -> bool:
        status_value = "accepted" if accept else "rejected"

        result = await self.user_follows.update_one(
            {
                "follower_id": int(follower_id),
                "following_id": int(target_id),
                "status": "pending",
            },
            {
                "$set": {
                    "status": status_value,
                    "updated_at": utcnow(),
                }
            },
        )

        if result.modified_count and accept:
            await self.notify(
                follower_id,
                target_id,
                "follow_accepted",
                {"user_id": target_id},
            )

        return bool(result.modified_count)

    async def invite_collaborator(
        self,
        playlist: dict[str, Any],
        owner_id: int,
        user_id: int,
        role: str,
    ) -> str:
        self.require_role(
            playlist,
            owner_id,
            {"owner"},
        )

        if role not in VALID_ROLES:
            raise RepositoryError("invalid_collaborator_role")

        if owner_id == user_id:
            raise RepositoryError("cannot_invite_owner")

        collaborators = playlist.get("collaborators", [])

        if len(collaborators) >= MAX_COLLABORATORS:
            raise RepositoryError(
                "collaborator_limit_reached",
                409,
            )

        if any(
            int(item.get("user_id", 0)) == int(user_id)
            for item in collaborators
        ):
            raise RepositoryError(
                "already_playlist_member",
                409,
            )

        target = await self.profiles.find_one({
            "_id": int(user_id),
        })

        if not target:
            raise RepositoryError("user_not_found", 404)

        invitation_id = secrets.token_urlsafe(24)
        now = utcnow()

        await self.invitations.insert_one({
            "_id": invitation_id,
            "invite_id": invitation_id,
            "playlist_id": playlist["_id"],
            "invited_user_id": int(user_id),
            "invited_by": int(owner_id),
            "role": role,
            "status": "pending",
            "created_at": now,
            "updated_at": now,
        })

        await self.notify(
            user_id,
            owner_id,
            "collaboration_invitation",
            {
                "playlist_id": playlist["_id"],
                "playlist_name": playlist["name"],
                "invitation_id": invitation_id,
                "role": role,
            },
        )

        return invitation_id

    async def list_invitations(
        self,
        user_id: int,
        limit: int = 30,
    ) -> list[dict[str, Any]]:
        cursor = self.invitations.find({
            "invited_user_id": int(user_id),
            "status": "pending",
        }).sort(
            "created_at",
            DESCENDING,
        ).limit(
            page_limit(limit),
        )

        results = []

        async for invitation in cursor:
            playlist = await self.playlists.find_one({
                "_id": invitation["playlist_id"],
                "deleted_at": {"$exists": False},
            })

            if not playlist:
                continue

            actor = await self.profiles.find_one({
                "_id": int(invitation["invited_by"]),
            }) or {}

            results.append({
                "id": invitation["invite_id"],
                "playlist_id": playlist["_id"],
                "playlist_name": playlist["name"],
                "invited_by": {
                    "handle": actor.get("handle"),
                    "display_name": actor.get(
                        "display_name",
                        "Listener",
                    ),
                },
                "role": invitation["role"],
                "created_at": (
                    invitation["created_at"].isoformat()
                    if isinstance(invitation.get("created_at"), datetime)
                    else None
                ),
            })

        return results

    async def respond_invitation(
        self,
        user_id: int,
        invitation_id: str,
        action: str,
    ) -> str:
        if action not in {"accept", "reject"}:
            raise RepositoryError("invalid_action")

        invitation = await self.invitations.find_one({
            "invite_id": invitation_id,
            "invited_user_id": int(user_id),
            "status": "pending",
        })

        if not invitation:
            raise RepositoryError(
                "invitation_not_found",
                404,
            )

        playlist = await self.playlists.find_one({
            "_id": invitation["playlist_id"],
            "deleted_at": {"$exists": False},
        })

        if not playlist:
            raise RepositoryError(
                "playlist_not_found",
                404,
            )

        now = utcnow()

        new_status = (
            "accepted"
            if action == "accept"
            else "rejected"
        )

        result = await self.invitations.update_one(
            {
                "_id": invitation["_id"],
                "status": "pending",
            },
            {
                "$set": {
                    "status": new_status,
                    "responded_at": now,
                    "updated_at": now,
                }
            },
        )

        if not result.modified_count:
            raise RepositoryError(
                "invitation_already_handled",
                409,
            )

        if action == "accept":
            current_collaborators = playlist.get("collaborators", [])

            already_added = any(
                int(item.get("user_id", 0)) == int(user_id)
                for item in current_collaborators
            )

            if not already_added:
                if len(current_collaborators) >= MAX_COLLABORATORS:
                    raise RepositoryError(
                        "collaborator_limit_reached",
                        409,
                    )

                await self.playlists.update_one(
                    {
                        "_id": playlist["_id"],
                        "deleted_at": {"$exists": False},
                    },
                    {
                        "$addToSet": {
                            "collaborators": {
                                "user_id": int(user_id),
                                "role": invitation["role"],
                                "added_at": now,
                            }
                        },
                        "$inc": {"version": 1},
                        "$set": {"updated_at": now},
                    },
                )

        await self.notify(
            int(invitation["invited_by"]),
            int(user_id),
            f"collaboration_{new_status}",
            {
                "playlist_id": playlist["_id"],
                "playlist_name": playlist["name"],
                "role": invitation["role"],
            },
        )

        return new_status

    async def update_collaborator(
        self,
        playlist: dict[str, Any],
        owner_id: int,
        target_id: int,
        role: str,
    ) -> None:
        self.require_role(
            playlist,
            owner_id,
            {"owner"},
        )

        if role not in VALID_ROLES:
            raise RepositoryError("invalid_collaborator_role")

        exists = any(
            int(item.get("user_id", 0)) == int(target_id)
            for item in playlist.get("collaborators", [])
        )

        if not exists:
            raise RepositoryError(
                "collaborator_not_found",
                404,
            )

        result = await self.playlists.update_one(
            {
                "_id": playlist["_id"],
                "version": int(playlist.get("version", 1)),
                "collaborators.user_id": int(target_id),
                "deleted_at": {"$exists": False},
            },
            {
                "$set": {
                    "collaborators.$.role": role,
                    "updated_at": utcnow(),
                },
                "$inc": {"version": 1},
            },
        )

        if not result.modified_count:
            raise RepositoryError(
                "playlist_version_conflict",
                409,
            )

        await self.notify(
            target_id,
            owner_id,
            "collaboration_role_changed",
            {
                "playlist_id": playlist["_id"],
                "playlist_name": playlist["name"],
                "role": role,
            },
        )

    async def remove_collaborator(
        self,
        playlist: dict[str, Any],
        owner_id: int,
        target_id: int,
    ) -> None:
        self.require_role(
            playlist,
            owner_id,
            {"owner"},
        )

        result = await self.playlists.update_one(
            {
                "_id": playlist["_id"],
                "collaborators.user_id": int(target_id),
                "deleted_at": {"$exists": False},
            },
            {
                "$pull": {
                    "collaborators": {
                        "user_id": int(target_id),
                    }
                },
                "$inc": {"version": 1},
                "$set": {"updated_at": utcnow()},
            },
        )

        if not result.modified_count:
            raise RepositoryError(
                "collaborator_not_found",
                404,
            )

        await self.notify(
            target_id,
            owner_id,
            "collaboration_removed",
            {
                "playlist_id": playlist["_id"],
                "playlist_name": playlist["name"],
            },
        )


repository = MusicRepository()