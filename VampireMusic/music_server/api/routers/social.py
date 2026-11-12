from __future__ import annotations

import logging

from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)

from pydantic import BaseModel, Field

from VampireMusic.music_server.api.dependencies import get_repository
from VampireMusic.music_server.api.events import event_hub
from VampireMusic.music_server.api.repository import (
    MusicRepository,
    RepositoryError,
)
from VampireMusic.music_server.api.schemas import (
    CollaboratorInvite,
    CollaboratorRoleUpdate,
    FollowAction,
    PlaylistCreate,
    PlaylistUpdate,
    ProfileUpdate,
    ReorderTracks,
    SettingsUpdate,
    TrackInput,
)
from VampireMusic.music_server.api.security import (
    get_current_user,
)


logger = logging.getLogger(
    "VampireMusic.music_server.api.social"
)

router = APIRouter(
    prefix="/api",
    tags=["Social and Library"],
)


class HistoryRecord(BaseModel):
    track: TrackInput
    played_seconds: int = Field(
        ge=0,
        le=86400,
    )


class SearchPeopleQuery(BaseModel):
    query: str = Field(
        min_length=2,
        max_length=60,
    )


def _raise_repository_error(exc: RepositoryError):
    raise HTTPException(
        status_code=exc.status,
        detail=exc.code,
    ) from exc


async def _get_playlist_for_user(
    repository: MusicRepository,
    playlist_id: str,
    user_id: int,
):
    try:
        playlist = await repository.get_playlist(
            playlist_id,
        )

        if not repository.can_view(
            playlist,
            user_id,
        ):
            raise HTTPException(
                status_code=403,
                detail="private_playlist",
            )

        return playlist

    except RepositoryError as exc:
        _raise_repository_error(exc)


# ---------------------------------------------------------
# Profile
# ---------------------------------------------------------

@router.get("/profile")
async def get_my_profile(
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    profile = await repository.ensure_profile(user)

    return {
        "ok": True,
        "profile": await repository.get_profile_payload(
            profile,
            int(user["id"]),
        ),
    }


@router.patch("/profile")
async def update_my_profile(
    payload: ProfileUpdate,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    try:
        profile = await repository.update_profile(
            int(user["id"]),
            payload,
        )

        result = await repository.get_profile_payload(
            profile,
            int(user["id"]),
        )

        await event_hub.publish_user(
            int(user["id"]),
            {
                "type": "profile.updated",
                "profile": result,
            },
        )

        return {
            "ok": True,
            "profile": result,
        }

    except RepositoryError as exc:
        _raise_repository_error(exc)


# ---------------------------------------------------------
# Public profiles and people
# ---------------------------------------------------------

@router.get("/people/{handle}")
async def get_person(
    handle: str,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    profile = await repository.profiles.find_one({
        "handle": handle.lower(),
        "banned": {"$ne": True},
    })

    if not profile:
        raise HTTPException(
            status_code=404,
            detail="user_not_found",
        )

    if (
        profile.get("visibility") == "private"
        and int(profile["_id"]) != int(user["id"])
    ):
        relation = await repository.user_follows.find_one({
            "follower_id": int(user["id"]),
            "following_id": int(profile["_id"]),
            "status": "accepted",
        })

        if not relation:
            raise HTTPException(
                status_code=403,
                detail="private_profile",
            )

    return {
        "ok": True,
        "profile": await repository.get_profile_payload(
            profile,
            int(user["id"]),
        ),
    }


@router.get("/search/people")
async def search_people(
    q: str = Query(min_length=2, max_length=60),
    limit: int = Query(default=20, ge=1, le=50),
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    try:
        results = await repository.search_people(
            q,
            int(user["id"]),
            limit,
        )

        return {
            "ok": True,
            "results": results,
        }

    except RepositoryError as exc:
        _raise_repository_error(exc)


@router.post("/people/{user_id}/follow")
async def follow_person(
    user_id: int,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    try:
        created = await repository.follow_user(
            int(user["id"]),
            int(user_id),
        )

        return {
            "ok": True,
            "created": created,
        }

    except RepositoryError as exc:
        _raise_repository_error(exc)


@router.delete("/people/{user_id}/follow")
async def unfollow_person(
    user_id: int,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    removed = await repository.unfollow_user(
        int(user["id"]),
        int(user_id),
    )

    return {
        "ok": True,
        "removed": removed,
    }


@router.post("/people/{user_id}/follow-response")
async def respond_follow_request(
    user_id: int,
    payload: FollowAction,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    try:
        updated = await repository.respond_follow(
            int(user["id"]),
            int(user_id),
            payload.action == "accept",
        )

        if not updated:
            raise HTTPException(
                status_code=404,
                detail="follow_request_not_found",
            )

        return {
            "ok": True,
            "status": payload.action,
        }

    except RepositoryError as exc:
        _raise_repository_error(exc)


# ---------------------------------------------------------
# Playlists
# ---------------------------------------------------------

@router.get("/playlists")
async def list_playlists(
    scope: str = Query(default="mine"),
    limit: int = Query(default=20, ge=1, le=50),
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    try:
        results = await repository.list_playlists(
            int(user["id"]),
            scope,
            limit,
        )

        return {
            "ok": True,
            "results": results,
            "count": len(results),
        }

    except RepositoryError as exc:
        _raise_repository_error(exc)


@router.post("/playlists", status_code=201)
async def create_playlist(
    payload: PlaylistCreate,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    try:
        await repository.ensure_profile(user)

        playlist = await repository.create_playlist(
            int(user["id"]),
            payload,
        )

        return {
            "ok": True,
            "playlist": playlist,
        }

    except RepositoryError as exc:
        _raise_repository_error(exc)


@router.get("/playlists/{playlist_id}")
async def get_playlist(
    playlist_id: str,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    playlist = await _get_playlist_for_user(
        repository,
        playlist_id,
        int(user["id"]),
    )

    return {
        "ok": True,
        "playlist": await repository.playlist_payload(
            playlist,
            int(user["id"]),
            include_tracks=True,
        ),
    }


@router.patch("/playlists/{playlist_id}")
async def update_playlist(
    playlist_id: str,
    payload: PlaylistUpdate,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    try:
        playlist = await repository.get_playlist(
            playlist_id,
        )

        updated = await repository.update_playlist(
            playlist,
            int(user["id"]),
            payload,
        )

        # Inform the owner and collaborators.
        recipients = {
            int(playlist["owner_id"]),
            *[
                int(item["user_id"])
                for item in playlist.get("collaborators", [])
            ],
        }

        event = {
            "type": "playlist.updated",
            "playlist_id": playlist_id,
            "version": updated["version"],
        }

        for recipient_id in recipients:
            await event_hub.publish_user(
                recipient_id,
                event,
            )

        return {
            "ok": True,
            "playlist": updated,
        }

    except RepositoryError as exc:
        _raise_repository_error(exc)


@router.delete("/playlists/{playlist_id}")
async def delete_playlist(
    playlist_id: str,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    try:
        playlist = await repository.get_playlist(
            playlist_id,
        )

        await repository.delete_playlist(
            playlist,
            int(user["id"]),
        )

        return {
            "ok": True,
            "deleted": True,
        }

    except RepositoryError as exc:
        _raise_repository_error(exc)


@router.post("/playlists/{playlist_id}/tracks")
async def add_playlist_track(
    playlist_id: str,
    payload: TrackInput,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    try:
        playlist = await repository.get_playlist(
            playlist_id,
        )

        updated = await repository.add_track(
            playlist,
            int(user["id"]),
            payload,
        )

        event = {
            "type": "playlist.track_added",
            "playlist_id": playlist_id,
            "track": payload.model_dump(),
            "version": updated["version"],
        }

        recipients = {
            int(playlist["owner_id"]),
            *[
                int(item["user_id"])
                for item in playlist.get("collaborators", [])
            ],
        }

        for recipient_id in recipients:
            await event_hub.publish_user(
                recipient_id,
                event,
            )

        return {
            "ok": True,
            "playlist": updated,
        }

    except RepositoryError as exc:
        _raise_repository_error(exc)


@router.delete("/playlists/{playlist_id}/tracks/{track_id}")
async def remove_playlist_track(
    playlist_id: str,
    track_id: str,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    try:
        playlist = await repository.get_playlist(
            playlist_id,
        )

        updated = await repository.remove_track(
            playlist,
            int(user["id"]),
            track_id,
        )

        event = {
            "type": "playlist.track_removed",
            "playlist_id": playlist_id,
            "track_id": track_id,
            "version": updated["version"],
        }

        recipients = {
            int(playlist["owner_id"]),
            *[
                int(item["user_id"])
                for item in playlist.get("collaborators", [])
            ],
        }

        for recipient_id in recipients:
            await event_hub.publish_user(
                recipient_id,
                event,
            )

        return {
            "ok": True,
            "playlist": updated,
        }

    except RepositoryError as exc:
        _raise_repository_error(exc)


@router.put("/playlists/{playlist_id}/tracks/order")
async def reorder_playlist_tracks(
    playlist_id: str,
    payload: ReorderTracks,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    try:
        playlist = await repository.get_playlist(
            playlist_id,
        )

        updated = await repository.reorder_tracks(
            playlist,
            int(user["id"]),
            payload.track_ids,
            payload.version,
        )

        return {
            "ok": True,
            "playlist": updated,
        }

    except RepositoryError as exc:
        _raise_repository_error(exc)


@router.get("/search/playlists")
async def search_playlists(
    q: str = Query(min_length=2, max_length=80),
    limit: int = Query(default=20, ge=1, le=50),
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    try:
        results = await repository.search_playlists(
            int(user["id"]),
            q,
            limit,
        )

        return {
            "ok": True,
            "results": results,
        }

    except RepositoryError as exc:
        _raise_repository_error(exc)


# ---------------------------------------------------------
# Playlist follow / like
# ---------------------------------------------------------

@router.post("/playlists/{playlist_id}/follow")
async def follow_playlist(
    playlist_id: str,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    try:
        playlist = await repository.get_playlist(
            playlist_id,
        )

        created = await repository.follow_playlist(
            int(user["id"]),
            playlist,
        )

        return {
            "ok": True,
            "followed": True,
            "created": created,
        }

    except RepositoryError as exc:
        _raise_repository_error(exc)


@router.delete("/playlists/{playlist_id}/follow")
async def unfollow_playlist(
    playlist_id: str,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    removed = await repository.unfollow_playlist(
        int(user["id"]),
        playlist_id,
    )

    return {
        "ok": True,
        "followed": False,
        "removed": removed,
    }


@router.post("/playlists/{playlist_id}/like")
async def like_playlist(
    playlist_id: str,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    try:
        playlist = await _get_playlist_for_user(
            repository,
            playlist_id,
            int(user["id"]),
        )

        created = await repository.like_playlist(
            int(user["id"]),
            playlist,
        )

        return {
            "ok": True,
            "liked": True,
            "created": created,
        }

    except RepositoryError as exc:
        _raise_repository_error(exc)


@router.delete("/playlists/{playlist_id}/like")
async def unlike_playlist(
    playlist_id: str,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    removed = await repository.unlike_playlist(
        int(user["id"]),
        playlist_id,
    )

    return {
        "ok": True,
        "liked": False,
        "removed": removed,
    }


# ---------------------------------------------------------
# Track likes and history
# ---------------------------------------------------------

@router.post("/tracks/{track_id}/like")
async def like_track(
    track_id: str,
    payload: TrackInput,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    if track_id != payload.id:
        raise HTTPException(
            status_code=400,
            detail="track_id_mismatch",
        )

    try:
        created = await repository.like_track(
            int(user["id"]),
            payload,
        )

        return {
            "ok": True,
            "liked": True,
            "created": created,
        }

    except RepositoryError as exc:
        _raise_repository_error(exc)


@router.delete("/tracks/{track_id}/like")
async def unlike_track(
    track_id: str,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    removed = await repository.unlike_track(
        int(user["id"]),
        track_id,
    )

    return {
        "ok": True,
        "liked": False,
        "removed": removed,
    }


@router.get("/library/liked-tracks")
async def get_liked_tracks(
    limit: int = Query(default=50, ge=1, le=50),
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    return {
        "ok": True,
        "results": await repository.liked_tracks(
            int(user["id"]),
            limit,
        ),
    }


@router.post("/listening/history")
async def record_listening_history(
    payload: HistoryRecord,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    recorded = await repository.record_history(
        int(user["id"]),
        payload.track,
        played_seconds=payload.played_seconds,
    )

    return {
        "ok": True,
        "recorded": recorded,
    }


@router.get("/listening/history")
async def get_listening_history(
    limit: int = Query(default=50, ge=1, le=50),
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    return {
        "ok": True,
        "results": await repository.get_history(
            int(user["id"]),
            limit,
        ),
    }


# ---------------------------------------------------------
# Collaborators and invitations
# ---------------------------------------------------------

@router.post("/playlists/{playlist_id}/invitations")
async def invite_collaborator(
    playlist_id: str,
    payload: CollaboratorInvite,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    try:
        playlist = await repository.get_playlist(
            playlist_id,
        )

        invitation_id = await repository.invite_collaborator(
            playlist,
            int(user["id"]),
            payload.user_id,
            payload.role,
        )

        return {
            "ok": True,
            "invitation_id": invitation_id,
            "status": "pending",
        }

    except RepositoryError as exc:
        _raise_repository_error(exc)


@router.patch(
    "/playlists/{playlist_id}/collaborators/{user_id}"
)
async def update_collaborator_role(
    playlist_id: str,
    user_id: int,
    payload: CollaboratorRoleUpdate,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    try:
        playlist = await repository.get_playlist(
            playlist_id,
        )

        await repository.update_collaborator(
            playlist,
            int(user["id"]),
            int(user_id),
            payload.role,
        )

        return {
            "ok": True,
            "user_id": int(user_id),
            "role": payload.role,
        }

    except RepositoryError as exc:
        _raise_repository_error(exc)


@router.delete(
    "/playlists/{playlist_id}/collaborators/{user_id}"
)
async def remove_collaborator(
    playlist_id: str,
    user_id: int,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    try:
        playlist = await repository.get_playlist(
            playlist_id,
        )

        await repository.remove_collaborator(
            playlist,
            int(user["id"]),
            int(user_id),
        )

        return {
            "ok": True,
            "removed": True,
        }

    except RepositoryError as exc:
        _raise_repository_error(exc)


@router.get("/invitations")
async def get_invitations(
    limit: int = Query(default=30, ge=1, le=50),
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    return {
        "ok": True,
        "results": await repository.list_invitations(
            int(user["id"]),
            limit,
        ),
    }


@router.post("/invitations/{invitation_id}/respond")
async def respond_invitation(
    invitation_id: str,
    payload: FollowAction,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    try:
        result = await repository.respond_invitation(
            int(user["id"]),
            invitation_id,
            payload.action,
        )

        return {
            "ok": True,
            "status": result,
        }

    except RepositoryError as exc:
        _raise_repository_error(exc)


# ---------------------------------------------------------
# Notifications
# ---------------------------------------------------------

@router.get("/notifications")
async def list_notifications(
    limit: int = Query(default=30, ge=1, le=50),
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    results, unread = await repository.list_notifications(
        int(user["id"]),
        limit,
    )

    return {
        "ok": True,
        "results": results,
        "unread_count": unread,
    }


@router.post("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    updated = await repository.mark_notification_read(
        int(user["id"]),
        notification_id,
    )

    return {
        "ok": True,
        "updated": updated,
    }


@router.post("/notifications/read-all")
async def mark_all_notifications_read(
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    updated = await repository.mark_all_notifications_read(
        int(user["id"]),
    )

    return {
        "ok": True,
        "updated": updated,
    }


# ---------------------------------------------------------
# Preferences
# ---------------------------------------------------------

@router.get("/settings")
async def get_settings(
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    return {
        "ok": True,
        "settings": await repository.get_settings(
            int(user["id"]),
        ),
    }


@router.patch("/settings")
async def update_settings(
    payload: SettingsUpdate,
    repository: MusicRepository = Depends(get_repository),
    user: dict = Depends(get_current_user),
):
    update = payload.model_dump(
        exclude_unset=True,
    )

    result = await repository.update_settings(
        int(user["id"]),
        update,
    )

    return {
        "ok": True,
        "settings": result,
    }