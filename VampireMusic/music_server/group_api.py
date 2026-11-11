
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
            "/api/groups",
            self.list_groups,
        )
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
        try:
            return int(user_id) in app.sudoers
        except (TypeError, AttributeError):
            return False

    @classmethod
    def _is_global_operator(cls, user_id: int) -> bool:
        owner_id = int(
            getattr(app, "owner", 0)
            or getattr(config, "OWNER_ID", 0)
            or 0
        )

        return (
            user_id == owner_id
            or cls._is_sudo(user_id)
        )

    async def _context(
        self,
        request: web.Request,
        *,
        require_control: bool,
        chat_id: int | None = None,
    ) -> dict[str, Any]:

        try:
            user_id = int(request["telegram_user"]["id"])
        except (KeyError, TypeError, ValueError):
            raise APIError("unauthorized", 401)

        try:
            if chat_id is None:
                chat_id = int(request.match_info["chat_id"])
            else:
                chat_id = int(chat_id)
        except (TypeError, ValueError, KeyError):
            raise APIError("invalid_chat_id", 400)

        if chat_id >= 0:
            raise APIError("group_only", 400)

        is_global_operator = self._is_global_operator(user_id)

        try:
            chat = await app.get_chat(chat_id)
        except Exception:
            raise APIError("bot_cannot_access_group", 403)

        chat_type = str(
            getattr(chat, "type", "")
        ).split(".")[-1].lower()

        if chat_type != "supergroup":
            raise APIError("supergroup_required", 400)

        try:
            assistant = await db.get_client(chat_id)
        except Exception:
            raise APIError("assistant_unavailable", 503)

        if assistant is None:
            raise APIError("assistant_unavailable", 503)

        # Normal users must belong to the group.
        # Bot owner and sudo users can access saved groups globally.
        is_group_member = False
        is_group_admin = False

        if is_global_operator:
            user_status = "global_operator"

        else:
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

            is_group_member = True
            user_status = self._status(user_member)

            is_group_admin = user_status in {
                "administrator",
                "creator",
                "owner",
            }

        # Both playback clients must be present in the group.
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

        is_authorized = False

        # Group admins and global operators do not need a DB auth lookup.
        if not is_global_operator and not is_group_admin:
            try:
                is_authorized = await db.is_auth(
                    chat_id,
                    user_id,
                )
            except Exception:
                raise APIError("authorization_check_failed", 503)

        can_control = (
            is_global_operator
            or is_group_admin
            or is_authorized
        )

        if require_control and not can_control:
            raise APIError(
                "group_control_permission_denied",
                403,
            )

        if is_global_operator:
            access_role = "global_operator"
        elif is_group_admin:
            access_role = "group_admin"
        elif is_authorized:
            access_role = "authorized"
        else:
            access_role = "view_only"

        return {
            "chat_id": chat_id,
            "chat": chat,
            "user_id": user_id,
            "user_status": user_status,
            "assistant": assistant,
            "is_member": is_group_member,
            "is_global_operator": is_global_operator,
            "is_group_admin": is_group_admin,
            "is_authorized": is_authorized,
            "can_control": can_control,
            "access_role": access_role,
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

    async def _group_payload(
        self,
        context: dict[str, Any],
    ) -> dict[str, Any]:

        chat_id = context["chat_id"]
        items = queue.get_queue(chat_id)
        current = items[0] if items else None

        active = await db.get_call(chat_id)
        playing = await db.playing(chat_id) if active else False

        return {
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
            "is_member": context["is_member"],
            "is_global_operator": context["is_global_operator"],
            "is_group_admin": context["is_group_admin"],
            "is_authorized": context["is_authorized"],
            "access_role": context["access_role"],
            "can_control": context["can_control"],
            "active": active,
            "playing": playing,
            "current": self._track_payload(current),
            "queue": [
                self._track_payload(item)
                for item in items[1:]
            ],
            "queue_count": max(0, len(items) - 1),
        }

    async def list_groups(self, request: web.Request):
        try:
            limit = int(request.query.get("limit", "20"))
            offset = int(request.query.get("offset", "0"))
        except (TypeError, ValueError):
            raise APIError("invalid_pagination", 400)

        limit = max(1, min(limit, 20))
        offset = max(0, min(offset, 10000))

        try:
            saved_chat_ids = await db.get_chats()
        except Exception:
            raise APIError("group_list_unavailable", 503)

        candidates = []
        seen = set()

        for raw_id in reversed(saved_chat_ids):
            try:
                chat_id = int(raw_id)
            except (TypeError, ValueError):
                continue

            if chat_id >= 0 or chat_id in seen:
                continue

            seen.add(chat_id)
            candidates.append(chat_id)

        page_ids = candidates[offset:offset + limit]
        semaphore = asyncio.Semaphore(3)

        async def inspect_group(group_id: int):
            async with semaphore:
                return await self._context(
                    request,
                    require_control=False,
                    chat_id=group_id,
                )

        checked = await asyncio.gather(
            *[
                inspect_group(group_id)
                for group_id in page_ids
            ],
            return_exceptions=True,
        )

        groups = []

        for context in checked:
            if isinstance(context, asyncio.CancelledError):
                raise context

            if isinstance(context, BaseException):
                # Groups the user cannot access are not exposed.
                continue

            try:
                groups.append(
                    await self._group_payload(context)
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                continue

        next_offset = (
            offset + len(page_ids)
            if offset + len(page_ids) < len(candidates)
            else None
        )

        return web.json_response({
            "ok": True,
            "groups": groups,
            "count": len(groups),
            "next_offset": next_offset,
        })

    async def _start_media(
        self,
        chat_id: int,
        media: Track,
        *,
        mode: str,
    ) -> dict[str, Any]:

        async with self._locks[chat_id]:
            active = await db.get_call(chat_id)
            existing = queue.get_queue(chat_id)
            current = existing[0] if existing else None

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

            elif mode == "queue":
                if active and existing:
                    if len(existing) >= self._queue_limit():
                        raise APIError("group_queue_limit", 409)

                    position = queue.add(chat_id, media)

                    VampireMusic.schedule_prefetch(chat_id)

                    return {
                        "status": "queued",
                        "position": position,
                    }

                # No active track exists: the requested track becomes
                # the first track and starts playback immediately.
                queue.clear(chat_id)
                queue.add(chat_id, media)

            else:
                raise APIError("unsupported_group_action", 400)

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

        if mode not in {"play_now", "queue"}:
            raise APIError("unsupported_group_action", 400)

        async with self._locks[chat_id]:
            active = await db.get_call(chat_id)
            existing = queue.get_queue(chat_id)

            # Queue behind the current track only when a real current
            # queue item exists. Otherwise the playlist must start now.
            if mode == "queue" and active and existing:
                if len(existing) + len(medias) > limit:
                    raise APIError("group_queue_limit", 409)

                positions = [
                    queue.add(chat_id, media)
                    for media in medias
                ]

                VampireMusic.schedule_prefetch(chat_id)

                return {
                    "status": "queued",
                    "added": len(medias),
                    "first_position": positions[0],
                }

            if mode == "play_now" and active:
                pending = existing[1:] if existing else []

                if len(pending) + len(medias) > limit:
                    raise APIError("group_queue_limit", 409)

                current = existing[0] if existing else None

                if current and current.message_id:
                    try:
                        await app.delete_messages(
                            chat_id,
                            current.message_id,
                        )
                    except Exception:
                        pass

                queue.queues[chat_id] = deque([
                    *medias,
                    *pending,
                ])

            else:
                # Also handles queue mode when nothing is playing:
                # the first playlist track starts immediately.
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

        # A manually connected, verified group becomes discoverable
        # on the next Mini App load.
        try:
            if not await db.is_chat(chat_id):
                await db.add_chat(chat_id)
        except Exception:
            pass

        return web.json_response({
            "ok": True,
            "group": await self._group_payload(context),
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
