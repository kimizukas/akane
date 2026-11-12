from __future__ import annotations

import asyncio
import html

from collections import deque, defaultdict
from typing import Any

from fastapi import HTTPException

from VampireMusic import (
    app as bot,
    config,
    db,
    logger,
    queue as music_queue,
    VampireMusic as voice_engine,
)

from VampireMusic.core.youtube import VIDEO_ID_RE
from VampireMusic.helpers._dataclass import Track

from .repository import (
    MusicRepository,
    RepositoryError,
)
from .schemas import TrackInput


class GroupServiceError(Exception):
    def __init__(
        self,
        code: str,
        status_code: int = 400,
        message: str | None = None,
    ):
        super().__init__(message or code)
        self.code = code
        self.status_code = status_code
        self.message = message or code.replace("_", " ")


class GroupService:
    """
    FastAPI adapter for the already-running Telegram bot and voice engine.

    This class does not create Telegram clients or a second playback engine.
    It uses the same bot, assistant clients, MongoDB wrapper and queue as
    the original VampireMusic process.
    """

    def __init__(self, repository: MusicRepository):
        self.repository = repository
        self._locks: dict[int, asyncio.Lock] = defaultdict(asyncio.Lock)
        self._sudo_cache: set[int] = set()
        self._sudo_cache_until = 0.0
        self._sudo_lock = asyncio.Lock()

    @staticmethod
    def _status(member: Any) -> str:
        return str(
            getattr(member, "status", "unknown")
        ).split(".")[-1].lower()

    @classmethod
    def _is_member(cls, member: Any) -> bool:
        value = cls._status(member)

        if value in {"left", "kicked", "banned"}:
            return False

        if value == "restricted":
            return bool(
                getattr(member, "is_member", False)
            )

        return value in {
            "creator",
            "owner",
            "administrator",
            "member",
        }

    async def _is_global_operator(self, user_id: int) -> bool:
        owner_id = int(
            getattr(config, "OWNER_ID", 0)
            or getattr(bot, "owner", 0)
            or 0
        )

        if owner_id and int(user_id) == owner_id:
            return True

        import time

        now = time.monotonic()

        if now < self._sudo_cache_until:
            return int(user_id) in self._sudo_cache

        async with self._sudo_lock:
            now = time.monotonic()

            if now < self._sudo_cache_until:
                return int(user_id) in self._sudo_cache

            try:
                raw_ids = await db.get_sudoers()
            except Exception as exc:
                logger.exception(
                    "Could not load global sudo users for Mini App."
                )

                raise GroupServiceError(
                    "global_permission_check_failed",
                    503,
                ) from exc

            parsed: set[int] = set()

            for raw_id in raw_ids or []:
                try:
                    parsed.add(int(raw_id))
                except (TypeError, ValueError):
                    continue

            self._sudo_cache = parsed
            self._sudo_cache_until = now + 30.0

        return int(user_id) in self._sudo_cache

    async def context(
        self,
        user_id: int,
        chat_id: int,
        *,
        require_control: bool,
    ) -> dict[str, Any]:
        try:
            chat_id = int(chat_id)
            user_id = int(user_id)
        except (TypeError, ValueError) as exc:
            raise GroupServiceError(
                "invalid_chat_id",
                400,
            ) from exc

        if chat_id >= 0:
            raise GroupServiceError(
                "group_only",
                400,
            )

        is_global_operator = await self._is_global_operator(
            user_id,
        )

        try:
            chat = await bot.get_chat(chat_id)
        except Exception as exc:
            raise GroupServiceError(
                "bot_cannot_access_group",
                403,
            ) from exc

        chat_type = str(
            getattr(chat, "type", "")
        ).split(".")[-1].lower()

        if chat_type != "supergroup":
            raise GroupServiceError(
                "supergroup_required",
                400,
            )

        try:
            assistant = await db.get_client(chat_id)
        except Exception as exc:
            logger.warning(
                "Could not resolve assistant for group %s: %s",
                chat_id,
                type(exc).__name__,
            )

            raise GroupServiceError(
                "assistant_unavailable",
                503,
            ) from exc

        if assistant is None:
            raise GroupServiceError(
                "assistant_unavailable",
                503,
            )

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
            except Exception as exc:
                raise GroupServiceError(
                    "userbot_cannot_verify_membership",
                    403,
                ) from exc

            if not self._is_member(user_member):
                raise GroupServiceError(
                    "not_group_member",
                    403,
                )

            is_group_member = True
            user_status = self._status(user_member)

            is_group_admin = user_status in {
                "administrator",
                "creator",
                "owner",
            }

        # Both clients must remain in the group for voice playback.
        try:
            bot_member = await bot.get_chat_member(
                chat_id,
                bot.id,
            )

            assistant_member = await assistant.get_chat_member(
                chat_id,
                assistant.id,
            )

        except Exception as exc:
            raise GroupServiceError(
                "unable_to_verify_group_clients",
                403,
            ) from exc

        if not self._is_member(bot_member):
            raise GroupServiceError(
                "bot_not_in_group",
                409,
            )

        if not self._is_member(assistant_member):
            raise GroupServiceError(
                "assistant_not_in_group",
                409,
            )

        is_authorized = False

        if not is_global_operator and not is_group_admin:
            try:
                is_authorized = await db.is_auth(
                    chat_id,
                    user_id,
                )
            except Exception as exc:
                raise GroupServiceError(
                    "authorization_check_failed",
                    503,
                ) from exc

        can_control = (
            is_global_operator
            or is_group_admin
            or is_authorized
        )

        if require_control and not can_control:
            raise GroupServiceError(
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
            "assistant": assistant,
            "user_id": user_id,
            "user_status": user_status,
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
            "id": str(
                getattr(media, "id", "")
            ),
            "title": str(
                getattr(media, "title", None)
                or "Unknown track"
            ),
            "artist": str(
                getattr(media, "channel_name", None)
                or "Unknown artist"
            ),
            "duration": str(
                getattr(media, "duration", None)
                or "00:00"
            ),
            "duration_sec": int(
                getattr(media, "duration_sec", 0)
                or 0
            ),
            "thumbnail": getattr(
                media,
                "thumbnail",
                None,
            ),
            "user": str(
                getattr(media, "user", None)
                or ""
            ),
        }

    async def group_payload(
        self,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        chat_id = int(context["chat_id"])
        items = music_queue.get_queue(chat_id)

        current = items[0] if items else None
        active = await db.get_call(chat_id)

        playing = (
            await db.playing(chat_id)
            if active
            else False
        )

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
            "active": bool(active),
            "playing": bool(playing),
            "current": self._track_payload(current),
            "queue": [
                self._track_payload(item)
                for item in items[1:]
            ],
            "queue_count": max(0, len(items) - 1),
        }

    async def list_groups(
        self,
        user_id: int,
        limit: int = 20,
        offset: int = 0,
    ) -> dict[str, Any]:
        try:
            limit = max(1, min(int(limit), 20))
            offset = max(0, min(int(offset), 10000))
        except (TypeError, ValueError) as exc:
            raise GroupServiceError(
                "invalid_pagination",
                400,
            ) from exc

        try:
            saved_ids = await db.get_chats()
        except Exception as exc:
            raise GroupServiceError(
                "group_list_unavailable",
                503,
            ) from exc

        candidates: list[int] = []
        seen: set[int] = set()

        for raw_id in reversed(saved_ids or []):
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

        async def inspect(chat_id: int):
            async with semaphore:
                context = await self.context(
                    user_id,
                    chat_id,
                    require_control=False,
                )

                return await self.group_payload(context)

        results = await asyncio.gather(
            *[
                inspect(chat_id)
                for chat_id in page_ids
            ],
            return_exceptions=True,
        )

        groups = []

        for result in results:
            if isinstance(result, asyncio.CancelledError):
                raise result

            if isinstance(result, BaseException):
                logger.debug(
                    "Skipping inaccessible group in Mini App: %s",
                    type(result).__name__,
                )
                continue

            groups.append(result)

        next_offset = (
            offset + len(page_ids)
            if offset + len(page_ids) < len(candidates)
            else None
        )

        return {
            "groups": groups,
            "count": len(groups),
            "next_offset": next_offset,
        }

    async def status(
        self,
        user_id: int,
        chat_id: int,
    ) -> dict[str, Any]:
        context = await self.context(
            user_id,
            chat_id,
            require_control=False,
        )

        saved = await db.get_chats()

        if chat_id not in saved:
            try:
                await db.add_chat(chat_id)
            except Exception:
                # Do not make viewing group playback depend on registration.
                logger.exception(
                    "Unable to save group %s from Mini App.",
                    chat_id,
                )

                raise GroupServiceError(
                    "group_registration_failed",
                    503,
                )

        return await self.group_payload(context)

    @staticmethod
    def _duration(seconds: int) -> str:
        hours, remainder = divmod(
            int(seconds),
            3600,
        )

        minutes, seconds = divmod(
            remainder,
            60,
        )

        if hours:
            return f"{hours:02d}:{minutes:02d}:{seconds:02d}"

        return f"{minutes:02d}:{seconds:02d}"

    def _make_track(
        self,
        data: TrackInput,
        requester: str,
    ) -> Track:
        track_id = str(data.id).strip()

        if not VIDEO_ID_RE.fullmatch(track_id):
            raise GroupServiceError(
                "invalid_track_id",
                400,
            )

        return Track(
            id=track_id,
            title=data.title,
            channel_name=data.artist or "Unknown artist",
            duration=self._duration(data.duration_sec),
            duration_sec=int(data.duration_sec),
            url=f"https://www.youtube.com/watch?v={track_id}",
            thumbnail=data.thumbnail,
            user=requester,
            video=False,
        )

    @staticmethod
    def _queue_limit() -> int:
        try:
            return max(
                1,
                min(
                    int(config.QUEUE_LIMIT),
                    500,
                ),
            )
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
            existing = music_queue.get_queue(chat_id)

            current = existing[0] if existing else None

            if mode == "play_now":
                if active:
                    if current and current.message_id:
                        try:
                            await bot.delete_messages(
                                chat_id,
                                current.message_id,
                            )
                        except Exception:
                            pass

                    music_queue.force_add(
                        chat_id,
                        media,
                    )

                else:
                    music_queue.clear(chat_id)
                    music_queue.add(chat_id, media)

            elif mode == "queue":
                if active and existing:
                    # Duplicate prevention for group queue.
                    position, found = music_queue.check_item(
                        chat_id,
                        media.id,
                    )

                    if found is not None:
                        return {
                            "status": "already_queued",
                            "position": position,
                        }

                    if len(existing) >= self._queue_limit():
                        raise GroupServiceError(
                            "group_queue_limit",
                            409,
                        )

                    position = music_queue.add(
                        chat_id,
                        media,
                    )

                    voice_engine.schedule_prefetch(chat_id)

                    return {
                        "status": "queued",
                        "position": position,
                    }

                # Queue requested while idle starts the first item now.
                music_queue.clear(chat_id)
                music_queue.add(chat_id, media)

            else:
                raise GroupServiceError(
                    "unsupported_group_action",
                    400,
                )

            notice = await bot.send_message(
                chat_id,
                "♫ <b>Playing from Taalune</b>\n"
                + html.escape(media.title),
            )

            await voice_engine.play_media(
                chat_id=chat_id,
                message=notice,
                media=media,
            )

            if (
                not await db.get_call(chat_id)
                or music_queue.get_current(chat_id) is not media
            ):
                raise GroupServiceError(
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
            raise GroupServiceError(
                "playlist_empty",
                409,
            )

        medias: list[Track] = []
        seen: set[str] = set()

        for item in tracks:
            try:
                track_data = TrackInput.model_validate(item)
            except Exception:
                continue

            if track_data.id in seen:
                continue

            seen.add(track_data.id)

            medias.append(
                self._make_track(
                    track_data,
                    requester,
                )
            )

        if not medias:
            raise GroupServiceError(
                "playlist_empty",
                409,
            )

        limit = self._queue_limit()

        if len(medias) > limit:
            raise GroupServiceError(
                "group_queue_limit",
                409,
            )

        if mode not in {"play_now", "queue"}:
            raise GroupServiceError(
                "unsupported_group_action",
                400,
            )

        async with self._locks[chat_id]:
            active = await db.get_call(chat_id)
            existing = music_queue.get_queue(chat_id)

            if mode == "queue" and active and existing:
                existing_ids = {
                    str(item.id)
                    for item in existing
                }

                filtered = [
                    media
                    for media in medias
                    if str(media.id) not in existing_ids
                ]

                if not filtered:
                    return {
                        "status": "already_queued",
                        "added": 0,
                        "first_position": None,
                    }

                if len(existing) + len(filtered) > limit:
                    raise GroupServiceError(
                        "group_queue_limit",
                        409,
                    )

                positions = [
                    music_queue.add(chat_id, media)
                    for media in filtered
                ]

                voice_engine.schedule_prefetch(chat_id)

                return {
                    "status": "queued",
                    "added": len(filtered),
                    "first_position": positions[0],
                }

            if mode == "play_now" and active:
                pending = existing[1:] if existing else []

                if len(pending) + len(medias) > limit:
                    raise GroupServiceError(
                        "group_queue_limit",
                        409,
                    )

                current = existing[0] if existing else None

                if current and current.message_id:
                    try:
                        await bot.delete_messages(
                            chat_id,
                            current.message_id,
                        )
                    except Exception:
                        pass

                music_queue.queues[chat_id] = deque([
                    *medias,
                    *pending,
                ])

            else:
                # Idle group: play the first playlist entry immediately.
                music_queue.clear(chat_id)

                for media in medias:
                    music_queue.add(
                        chat_id,
                        media,
                    )

            notice = await bot.send_message(
                chat_id,
                "♫ <b>Playlist started from Taalune</b>\n"
                + html.escape(medias[0].title),
            )

            await voice_engine.play_media(
                chat_id=chat_id,
                message=notice,
                media=medias[0],
            )

            if (
                not await db.get_call(chat_id)
                or music_queue.get_current(chat_id) is not medias[0]
            ):
                raise GroupServiceError(
                    "voice_chat_playback_not_started",
                    409,
                )

            return {
                "status": "playing",
                "added": len(medias),
                "first_position": 0,
            }

    async def control(
        self,
        user: dict[str, Any],
        chat_id: int,
        data: Any,
    ) -> dict[str, Any]:
        context = await self.context(
            int(user["id"]),
            int(chat_id),
            require_control=True,
        )

        action = data.action

        requester = (
            "Mini App · @"
            + str(user.get("username") or user["id"])
        )

        if action in {
            "pause",
            "resume",
            "skip",
            "stop",
        }:
            if not await db.get_call(chat_id):
                raise GroupServiceError(
                    "nothing_playing",
                    409,
                )

            if action == "pause":
                if not await db.playing(chat_id):
                    raise GroupServiceError(
                        "already_paused",
                        409,
                    )

                result = await voice_engine.pause(chat_id)

            elif action == "resume":
                if await db.playing(chat_id):
                    raise GroupServiceError(
                        "already_playing",
                        409,
                    )

                result = await voice_engine.resume(chat_id)

            elif action == "skip":
                await voice_engine.play_next(
                    chat_id,
                    skip_user=requester,
                )
                result = True

            else:
                await voice_engine.stop(chat_id)
                result = True

            if result is False:
                raise GroupServiceError(
                    "group_control_failed",
                    409,
                )

            return {
                "action": action,
                "status": "updated",
                "group": await self.group_payload(context),
            }

        if action in {"play_track", "queue_track"}:
            if data.track is None:
                raise GroupServiceError(
                    "track_required",
                    400,
                )

            media = self._make_track(
                data.track,
                requester,
            )

            result = await self._start_media(
                chat_id,
                media,
                mode=(
                    "play_now"
                    if action == "play_track"
                    else "queue"
                ),
            )

            return {
                **result,
                "action": action,
                "group": await self.status(
                    int(user["id"]),
                    chat_id,
                ),
            }

        if action in {"play_playlist", "queue_playlist"}:
            if not data.playlist_id:
                raise GroupServiceError(
                    "playlist_required",
                    400,
                )

            playlist = await self.repository.get_playlist(
                data.playlist_id,
            )

            if not self.repository.can_view(
                playlist,
                int(user["id"]),
            ):
                raise GroupServiceError(
                    "private_playlist",
                    403,
                )

            result = await self._start_playlist(
                chat_id,
                playlist.get("tracks", []),
                requester,
                mode=(
                    "play_now"
                    if action == "play_playlist"
                    else "queue"
                ),
            )

            return {
                **result,
                "action": action,
                "group": await self.status(
                    int(user["id"]),
                    chat_id,
                ),
            }

        raise GroupServiceError(
            "unsupported_group_action",
            400,
        )


group_service = GroupService