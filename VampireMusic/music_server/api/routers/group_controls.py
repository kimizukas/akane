
from __future__ import annotations

import random
import time

from collections import deque

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)
from pydantic import BaseModel, ConfigDict, Field

from VampireMusic import (
    app as bot,
    db,
    queue as music_queue,
    VampireMusic as voice_engine,
)

from VampireMusic.music_server.api.dependencies import (
    get_group_service,
)
from VampireMusic.music_server.api.events import event_hub
from VampireMusic.music_server.api.groups import (
    GroupService,
    GroupServiceError,
)
from VampireMusic.music_server.api.security import (
    get_current_user,
)


router = APIRouter(
    prefix="/api/groups",
    tags=["Group Player Controls"],
)


class ControlModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )


class SeekRequest(ControlModel):
    position_sec: int = Field(
        ge=1,
        le=86400,
    )


class LoopRequest(ControlModel):
    count: int = Field(
        ge=0,
        le=10,
    )


class VolumeRequest(ControlModel):
    volume: int = Field(
        ge=0,
        le=200,
    )


class QueueReorderRequest(ControlModel):
    track_ids: list[str] = Field(
        min_length=0,
        max_length=500,
    )


def _raise_group_error(exc: GroupServiceError):
    raise HTTPException(
        status_code=exc.status_code,
        detail=exc.code,
    ) from exc


async def _get_control_context(
    service: GroupService,
    user: dict,
    chat_id: int,
):
    return await service.context(
        int(user["id"]),
        int(chat_id),
        require_control=True,
    )


async def _publish_group(
    chat_id: int,
    group: dict,
    action: str,
):
    await event_hub.publish_group(
        int(chat_id),
        {
            "type": "group.updated",
            "action": action,
            "group": group,
        },
    )


@router.post("/{chat_id}/seek")
async def seek_group_track(
    chat_id: int,
    payload: SeekRequest,
    service: GroupService = Depends(get_group_service),
    user: dict = Depends(get_current_user),
):
    try:
        context = await _get_control_context(
            service,
            user,
            chat_id,
        )

        async with service._locks[int(chat_id)]:
            if not await db.get_call(int(chat_id)):
                raise HTTPException(
                    status_code=409,
                    detail="nothing_playing",
                )

            if not await db.playing(int(chat_id)):
                raise HTTPException(
                    status_code=409,
                    detail="resume_before_seeking",
                )

            media = music_queue.get_current(int(chat_id))

            if media is None:
                raise HTTPException(
                    status_code=409,
                    detail="current_track_missing",
                )

            duration = int(
                getattr(media, "duration_sec", 0) or 0
            )

            if duration <= 0:
                raise HTTPException(
                    status_code=409,
                    detail="track_duration_unavailable",
                )

            target = int(payload.position_sec)

            # Keep a small margin at the end so the stream does not
            # immediately finish while the seek operation is starting.
            if target >= duration - 1:
                raise HTTPException(
                    status_code=400,
                    detail="seek_position_out_of_range",
                )

            message = None
            message_id = int(
                getattr(media, "message_id", 0) or 0
            )

            if message_id:
                try:
                    message = await bot.get_messages(
                        int(chat_id),
                        message_id,
                    )

                    if (
                        not message
                        or not getattr(message, "id", None)
                        or getattr(message, "empty", False)
                    ):
                        message = None

                except Exception:
                    message = None

            if message is None:
                message = await bot.send_message(
                    int(chat_id),
                    "♫ Seeking current track from Taalune.",
                    parse_mode=None,
                )

                media.message_id = message.id

            # Existing TgCall implementation already supports seek_time.
            # No second player or new Telegram client is created here.
            await voice_engine.play_media(
                int(chat_id),
                message,
                media,
                target,
            )

            if music_queue.get_current(int(chat_id)) is not media:
                raise HTTPException(
                    status_code=409,
                    detail="track_changed_during_seek",
                )

            group = await service.group_payload(context)

        await _publish_group(
            int(chat_id),
            group,
            "seek",
        )

        return {
            "ok": True,
            "action": "seek",
            "position_sec": target,
            "group": group,
        }

    except GroupServiceError as exc:
        _raise_group_error(exc)


@router.post("/{chat_id}/shuffle")
async def shuffle_group_queue(
    chat_id: int,
    service: GroupService = Depends(get_group_service),
    user: dict = Depends(get_current_user),
):
    try:
        context = await _get_control_context(
            service,
            user,
            chat_id,
        )

        async with service._locks[int(chat_id)]:
            items = music_queue.get_queue(int(chat_id))

            if len(items) < 3:
                raise HTTPException(
                    status_code=409,
                    detail="not_enough_pending_tracks_to_shuffle",
                )

            current = items[0]
            pending = items[1:]

            random.shuffle(pending)

            music_queue.queues[int(chat_id)] = deque([
                current,
                *pending,
            ])

            voice_engine.schedule_prefetch(int(chat_id))

            group = await service.group_payload(context)

        await _publish_group(
            int(chat_id),
            group,
            "shuffle",
        )

        return {
            "ok": True,
            "action": "shuffle",
            "queue_count": group["queue_count"],
            "group": group,
        }

    except GroupServiceError as exc:
        _raise_group_error(exc)


@router.put("/{chat_id}/queue/order")
async def reorder_group_queue(
    chat_id: int,
    payload: QueueReorderRequest,
    service: GroupService = Depends(get_group_service),
    user: dict = Depends(get_current_user),
):
    try:
        context = await _get_control_context(
            service,
            user,
            chat_id,
        )

        async with service._locks[int(chat_id)]:
            items = music_queue.get_queue(int(chat_id))

            if not items:
                raise HTTPException(
                    status_code=409,
                    detail="queue_empty",
                )

            current = items[0]
            pending = items[1:]

            current_ids = [
                str(item.id)
                for item in pending
            ]

            requested_ids = [
                str(item)
                for item in payload.track_ids
            ]

            if len(requested_ids) != len(set(requested_ids)):
                raise HTTPException(
                    status_code=400,
                    detail="duplicate_queue_track_id",
                )

            if (
                len(requested_ids) != len(current_ids)
                or set(requested_ids) != set(current_ids)
            ):
                raise HTTPException(
                    status_code=409,
                    detail="queue_changed_refresh_and_retry",
                )

            by_id = {
                str(item.id): item
                for item in pending
            }

            reordered = [
                by_id[track_id]
                for track_id in requested_ids
            ]

            music_queue.queues[int(chat_id)] = deque([
                current,
                *reordered,
            ])

            voice_engine.schedule_prefetch(int(chat_id))

            group = await service.group_payload(context)

        await _publish_group(
            int(chat_id),
            group,
            "queue.reordered",
        )

        return {
            "ok": True,
            "action": "queue.reordered",
            "group": group,
        }

    except GroupServiceError as exc:
        _raise_group_error(exc)


@router.delete("/{chat_id}/queue/{track_id}")
async def remove_group_queue_track(
    chat_id: int,
    track_id: str,
    service: GroupService = Depends(get_group_service),
    user: dict = Depends(get_current_user),
):
    try:
        context = await _get_control_context(
            service,
            user,
            chat_id,
        )

        async with service._locks[int(chat_id)]:
            items = music_queue.get_queue(int(chat_id))

            if not items:
                raise HTTPException(
                    status_code=409,
                    detail="queue_empty",
                )

            # The current item at position zero is never removed by this
            # endpoint. Skip/stop remain the existing voice-engine actions.
            pending = items[1:]

            match_index = next(
                (
                    index
                    for index, item in enumerate(pending)
                    if str(item.id) == str(track_id)
                ),
                None,
            )

            if match_index is None:
                raise HTTPException(
                    status_code=404,
                    detail="queued_track_not_found",
                )

            del pending[match_index]

            music_queue.queues[int(chat_id)] = deque([
                items[0],
                *pending,
            ])

            voice_engine.schedule_prefetch(int(chat_id))

            group = await service.group_payload(context)

        await _publish_group(
            int(chat_id),
            group,
            "queue.track_removed",
        )

        return {
            "ok": True,
            "action": "queue.track_removed",
            "removed_track_id": str(track_id),
            "group": group,
        }

    except GroupServiceError as exc:
        _raise_group_error(exc)


@router.put("/{chat_id}/loop")
async def set_group_loop(
    chat_id: int,
    payload: LoopRequest,
    service: GroupService = Depends(get_group_service),
    user: dict = Depends(get_current_user),
):
    try:
        context = await _get_control_context(
            service,
            user,
            chat_id,
        )

        if payload.count and not await db.get_call(int(chat_id)):
            raise HTTPException(
                status_code=409,
                detail="nothing_playing",
            )

        # This is the same finite repeat counter used by the existing
        # /loop bot command: 0 disables it and 1-10 are repeat counts.
        await db.set_loop(
            int(chat_id),
            int(payload.count),
        )

        group = await service.group_payload(context)

        await _publish_group(
            int(chat_id),
            group,
            "loop.updated",
        )

        return {
            "ok": True,
            "action": "loop.updated",
            "loop_count": int(payload.count),
            "group": group,
        }

    except GroupServiceError as exc:
        _raise_group_error(exc)


@router.put("/{chat_id}/volume")
async def set_group_volume(
    chat_id: int,
    payload: VolumeRequest,
    service: GroupService = Depends(get_group_service),
    user: dict = Depends(get_current_user),
):
    try:
        context = await _get_control_context(
            service,
            user,
            chat_id,
        )

        if not await db.get_call(int(chat_id)):
            raise HTTPException(
                status_code=409,
                detail="nothing_playing",
            )

        voice_client = await db.get_assistant(int(chat_id))

        # Avoid assuming a method exists on a different PyTgCalls version.
        change_volume = getattr(
            voice_client,
            "change_volume_call",
            None,
        )

        if not callable(change_volume):
            raise HTTPException(
                status_code=501,
                detail="volume_control_not_supported_by_installed_pytgcalls",
            )

        await change_volume(
            int(chat_id),
            int(payload.volume),
        )

        group = await service.group_payload(context)

        await _publish_group(
            int(chat_id),
            group,
            "volume.updated",
        )

        return {
            "ok": True,
            "action": "volume.updated",
            "volume": int(payload.volume),
            "group": group,
        }

    except GroupServiceError as exc:
        _raise_group_error(exc)
