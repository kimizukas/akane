
"""Authenticated Telegram voice-chat controls for the Taalune Mini App."""

from __future__ import annotations

import asyncio
import html
from collections import defaultdict, deque
from typing import Any

from aiohttp import web

from VampireMusic import (
    app,
    config,
    db,
    queue,
    VampireMusic,
)
from VampireMusic.core.youtube import VIDEO_ID_RE
from VampireMusic.helpers._dataclass import Track
from VampireMusic.music_server.social import (
    APIError,
    clean_text,
    safe_https_url,
    json_body,
)


class GroupAPI:
    def __init__(self, social_store):
        self.social = social_store
        self._locks: dict[int, asyncio.Lock] = defaultdict(asyncio.Lock)

    def register(self, application: web.Application) -> None:
        application.router.add_get(
            "/api/groups/{chat_id}/status",
            self.status,
        )
        application.router.add_post(
            "/api/groups/{chat_id}/control",
            self.control,
        )

    @staticmethod
    def _status(member: Any) -> str:
        return str(
            getattr(member, "status", "unknown")
        ).split(".")[-1].lower()

    @classmethod
    def _is_member(cls, member: Any) -> bool:
        status = cls._status(member)

        if status in {"left", "kicked", "banned"}:
            return False

        if status == "restricted":
            return bool(getattr(member, "is_member", False))

        return status in {
            "creator",
            "owner",
            "administrator",
            "member",
            "restricted",
        }

    @staticmethod
    def _is_sudo(user_id: int) -> bool:
        """
        app.sudoers is Pyrogram's filters.user set-based filter.
        It supports membership checks and is populated at bot startup.
        """
        try:
            return int(user_id) in app.sudoers
        except (TypeError, AttributeError):
            return False

    async def _context(
        self,
        request: web.Request,
        *,
        require_control: bool,
    ) -> dict[str, Any]:

        user_id = int(request["telegram_user"]["id"])

        try:
            chat_id = int(request.match_info["chat_id"])
        except (TypeError, ValueError):
            raise APIError("invalid_chat_id", 400)

        if chat_id >= 0:
            raise APIError("group_only", 400)

        # The bot itself must be able to access the selected group.
        try:
            chat = await app.get_chat(chat_id)
        except Exception:
            raise APIError("bot_cannot_access_group", 403)

        chat_type = str(
            getattr(chat, "type", "")
        ).split(".")[-1].lower()

        if chat_type != "supergroup":
            raise APIError("supergroup_required", 400)

        # Resolve the assistant assigned to this specific group.
        try:
            assistant = await db.get_client(chat_id)
        except Exception:
            raise APIError("assistant_unavailable", 503)

        if assistant is None:
            raise APIError("assistant_unavailable", 503)

        # Always verify the requesting user is a member of this group.
        try:
            user_member = await assistant.get_chat_member(
                chat_id,
                user_id,
            )
        except Exception:
            raise APIError(
                "userbot_cannot_verify_membership",
                403,
            )

        if not self._is_member(user_member):
            raise APIError("not_group_member", 403)

        # Verify both playback clients are still members.
        try:
            bot_member = await app.get_chat_member(
                chat_id,
                app.id,
            )

            assistant_member = await assistant.get_chat_member(
                chat_id,
                assistant.id,
            )
        except Exception:
            raise APIError(
                "unable_to_verify_group_clients",
                403,
            )

        if not self._is_member(bot_member):
            raise APIError("bot_not_in_group", 409)

        if not self._is_member(assistant_member):
            raise APIError("assistant_not_in_group", 409)

        user_status = self._status(user_member)

        is_group_admin = user_status in {
            "administrator",
            "creator",
            "owner",
        }

        # Bot's global owner and SUDO access.
        owner_id = int(
            getattr(app, "owner", 0)
            or getattr(config, "OWNER_ID", 0)
            or 0
        )

        is_bot_owner = user_id == owner_id
        is_sudo = self._is_sudo(user_id)

        # Group-specific authorization from the existing database.
        try:
            is_authorized = await db.is_auth(
                chat_id,
                user_id,
            )
        except Exception:
            raise APIError("authorization_check_failed", 503)

        can_control = (
            is_group_admin
            or is_authorized
            or is_bot_owner
            or is_sudo
        )

        if require_control and not can_control:
            raise APIError(
                "group_control_permission_denied",
                403,
            )

        return {
            "chat_id": chat_id,
            "chat": chat,
            "user_id": user_id,
            "user_status": user_status,
            "assistant": assistant,
            "can_control": can_control,
            "is_bot_owner": is_bot_owner,
            "is_sudo": is_sudo,
        }

    @staticmethod
    def _track_payload(media: Any) -> dict[str, Any] | None:
        if media is None:
            return None

        return {
            "id": str(getattr(media, "id", "")),
            "title": str(
                getattr(media, "title", "Unknown track")
                or "Unknown track"
            ),
            "artist": str(
                getattr(media, "channel_name", None)
                or "Unknown artist"
            ),
            "duration": str(
                getattr(media, "duration", "00:00")
                or "00:00"
            ),
            "duration_sec": int(
                getattr(media, "duration_sec", 0) or 0
            ),
            "thumbnail": getattr(media, "thumbnail", None),
            "user": str(getattr(media, "user", "") or ""),
        }

    @staticmethod
    def _duration(seconds: int) -> str:
        hours, remainder = divmod(seconds, 3600)
        minutes, seconds = divmod(remainder, 60)

        if hours:
            return f"{hours:02d}:{minutes:02d}:{seconds:02d}"

        return f"{minutes:02d}:{seconds:02d}"

    def _make_track(
        self,
        data: dict[str, Any],
        requester: str,
    ) -> Track:

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

        thumbnail = safe_https_url(data.get("thumbnail"))

        return Track(
            id=track_id,
            title=title,
            channel_name=artist or "Unknown artist",
            duration=self._duration(duration_sec),
            duration_sec=duration_sec,
            url=f"https://www.youtube.com/watch?v={track_id}",
            thumbnail=thumbnail,
            user=requester,
            video=False,
        )

    @staticmethod
    def _queue_limit() -> int:
        try:
            return max(1, min(int(config.QUEUE_LIMIT), 500))
        except (TypeError, ValueError, AttributeError):
            return 100

    async def _start_media(
        self,
        chat_id: int,
        media: Track,
        *,
        mode: str,
    ) -> dict[str, Any]:

        async with self._locks[chat_id]:
            active = await db.get_call(chat_id)
            current = queue.get_current(chat_id)

            if mode == "play_now":
                if active:
                    if current and current.message_id:
                        try:
                            await app.delete_messages(
                                chat_id,
                                current.message_id,
                            )
                        except Exception:
                            pass

                    queue.force_add(chat_id, media)

                else:
                    queue.clear(chat_id)
                    queue.add(chat_id, media)

            elif not active:
                queue.clear(chat_id)
                queue.add(chat_id, media)

            else:
                limit = self._queue_limit()

                if len(queue.get_queue(chat_id)) >= limit:
                    raise APIError("group_queue_limit", 409)

                position = queue.add(chat_id, media)

                return {
                    "status": "queued",
                    "position": position,
                }

            notice = await app.send_message(
                chat_id,
                (
                    "♫ <b>Playing from Taalune</b>\n"
                    + html.escape(media.title)
                ),
            )

            await VampireMusic.play_media(
                chat_id=chat_id,
                message=notice,
                media=media,
            )

            if not await db.get_call(chat_id):
                raise APIError(
                    "voice_chat_playback_not_started",
                    409,
                )

            return {
                "status": "playing",
                "position": 0,
            }

    async def _start_playlist(
        self,
        chat_id: int,
        tracks: list[dict[str, Any]],
        requester: str,
        mode: str,
    ) -> dict[str, Any]:

        if not tracks:
            raise APIError("playlist_empty", 409)

        medias = [
            self._make_track(track, requester)
            for track in tracks
        ]

        limit = self._queue_limit()

        if len(medias) > limit:
            raise APIError("group_queue_limit", 409)

        async with self._locks[chat_id]:
            active = await db.get_call(chat_id)
            existing = queue.get_queue(chat_id)

            if mode == "queue" and active:
                if len(existing) + len(medias) > limit:
                    raise APIError("group_queue_limit", 409)

                positions = [
                    queue.add(chat_id, media)
                    for media in medias
                ]

                return {
                    "status": "queued",
                    "added": len(medias),
                    "first_position": positions[0],
                }

            if mode == "play_now" and active:
                pending = existing[1:]

                if len(pending) + len(medias) > limit:
                    raise APIError("group_queue_limit", 409)

                current = queue.get_current(chat_id)

                if current and current.message_id:
                    try:
                        await app.delete_messages(
                            chat_id,
                            current.message_id,
                        )
                    except Exception:
                        pass

                # New playlist becomes current; existing upcoming tracks
                # remain behind the new playlist.
                queue.queues[chat_id] = deque([
                    *medias,
                    *pending,
                ])

            else:
                queue.clear(chat_id)

                for media in medias:
                    queue.add(chat_id, media)

            notice = await app.send_message(
                chat_id,
                (
                    "♫ <b>Playlist started from Taalune</b>\n"
                    + html.escape(medias[0].title)
                ),
            )

            await VampireMusic.play_media(
                chat_id=chat_id,
                message=notice,
                media=medias[0],
            )

            if not await db.get_call(chat_id):
                raise APIError(
                    "voice_chat_playback_not_started",
                    409,
                )

            return {
                "status": "playing",
                "added": len(medias),
                "first_position": 0,
            }

    async def status(self, request: web.Request):
        context = await self._context(
            request,
            require_control=False,
        )

        chat_id = context["chat_id"]
        items = queue.get_queue(chat_id)
        current = items[0] if items else None

        active = await db.get_call(chat_id)
        playing = await db.playing(chat_id) if active else False

        return web.json_response({
            "ok": True,
            "group": {
                "chat_id": chat_id,
                "title": getattr(
                    context["chat"],
                    "title",
                    "Telegram group",
                ),
                "username": getattr(
                    context["chat"],
                    "username",
                    None,
                ),
                "user_status": context["user_status"],
                "assistant_id": context["assistant"].id,
                "can_control": context["can_control"],
                "active": active,
                "playing": playing,
                "current": self._track_payload(current),
                "queue": [
                    self._track_payload(item)
                    for item in items[1:]
                ],
                "queue_count": max(0, len(items) - 1),
            },
        })

    async def control(self, request: web.Request):
        context = await self._context(
            request,
            require_control=True,
        )

        chat_id = context["chat_id"]
        user = request["telegram_user"]

        requester = (
            f"Mini App · @{user.get('username') or user['id']}"
        )

        data = await json_body(request)
        action = data.get("action")

        if action in {"pause", "resume", "skip", "stop"}:
            if not await db.get_call(chat_id):
                raise APIError("nothing_playing", 409)

            if action == "pause":
                if not await db.playing(chat_id):
                    raise APIError("already_paused", 409)

                result = await VampireMusic.pause(chat_id)

            elif action == "resume":
                if await db.playing(chat_id):
                    raise APIError("already_playing", 409)

                result = await VampireMusic.resume(chat_id)

            elif action == "skip":
                await VampireMusic.play_next(
                    chat_id,
                    skip_user=requester,
                )
                result = True

            else:
                await VampireMusic.stop(chat_id)
                result = True

            if result is False:
                raise APIError("group_control_failed", 409)

            return web.json_response({
                "ok": True,
                "action": action,
            })

        if action in {"queue_track", "play_track"}:
            track_data = data.get("track")

            if not isinstance(track_data, dict):
                raise APIError("track_required", 400)

            media = self._make_track(
                track_data,
                requester,
            )

            mode = (
                "play_now"
                if action == "play_track"
                else "queue"
            )

            result = await self._start_media(
                chat_id,
                media,
                mode=mode,
            )

            return web.json_response({
                "ok": True,
                **result,
            })

        if action in {"queue_playlist", "play_playlist"}:
            if not self.social.ready:
                raise APIError(
                    "social_storage_unavailable",
                    503,
                )

            playlist_id = data.get("playlist_id")

            playlist = await self.social.get_playlist(
                playlist_id,
            )

            if not await self.social.can_view_playlist(
                playlist,
                context["user_id"],
            ):
                raise APIError("private_playlist", 403)

            mode = (
                "play_now"
                if action == "play_playlist"
                else "queue"
            )

            result = await self._start_playlist(
                chat_id,
                playlist.get("tracks", []),
                requester,
                mode,
            )

            return web.json_response({
                "ok": True,
                **result,
            })

        raise APIError("unsupported_group_action", 400)


def register_group_routes(
    application: web.Application,
    social_store,
) -> GroupAPI:

    api = GroupAPI(social_store)
    api.register(application)
    return api
