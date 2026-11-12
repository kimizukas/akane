from __future__ import annotations

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
)

from VampireMusic.music_server.api.dependencies import (
    get_group_service,
)

from VampireMusic.music_server.api.events import event_hub

from VampireMusic.music_server.api.groups import (
    GroupService,
    GroupServiceError,
)

from VampireMusic.music_server.api.schemas import GroupControl

from VampireMusic.music_server.api.security import (
    get_current_user,
)


router = APIRouter(
    prefix="/api/groups",
    tags=["Group Voice Chat"],
)


def _raise_group_error(exc: GroupServiceError):
    raise HTTPException(
        status_code=exc.status_code,
        detail=exc.code,
    ) from exc


@router.get("")
async def list_groups(
    limit: int = Query(default=20, ge=1, le=20),
    offset: int = Query(default=0, ge=0, le=10000),
    service: GroupService = Depends(get_group_service),
    user: dict = Depends(get_current_user),
):
    try:
        result = await service.list_groups(
            int(user["id"]),
            limit,
            offset,
        )

        return {
            "ok": True,
            **result,
        }

    except GroupServiceError as exc:
        _raise_group_error(exc)


@router.get("/{chat_id}/status")
async def group_status(
    chat_id: int,
    service: GroupService = Depends(get_group_service),
    user: dict = Depends(get_current_user),
):
    try:
        group = await service.status(
            int(user["id"]),
            int(chat_id),
        )

        return {
            "ok": True,
            "group": group,
        }

    except GroupServiceError as exc:
        _raise_group_error(exc)


@router.post("/{chat_id}/control")
async def group_control(
    chat_id: int,
    payload: GroupControl,
    service: GroupService = Depends(get_group_service),
    user: dict = Depends(get_current_user),
):
    try:
        result = await service.control(
            user,
            int(chat_id),
            payload,
        )

        group = result.get("group")

        # Connected Mini App clients subscribed to this group
        # receive the updated player state.
        if group:
            await event_hub.publish_group(
                int(chat_id),
                {
                    "type": "group.updated",
                    "group": group,
                },
            )

        return {
            "ok": True,
            **result,
        }

    except GroupServiceError as exc:
        _raise_group_error(exc)