from __future__ import annotations

import re

from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)

from VampireMusic.core.youtube import VIDEO_ID_RE


class APIModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        validate_assignment=True,
    )


class RefreshRequest(APIModel):
    refresh_token: str = Field(
        min_length=32,
        max_length=256,
    )


class TrackInput(APIModel):
    # Persisted playlist entries may include added_by / added_at.
    model_config = ConfigDict(
        extra="ignore",
        str_strip_whitespace=True,
        validate_assignment=True,
    )

    id: str = Field(
        min_length=11,
        max_length=11,
    )

    title: str = Field(
        min_length=1,
        max_length=160,
    )

    artist: str = Field(
        default="Unknown artist",
        max_length=160,
    )

    duration_sec: int = Field(
        default=0,
        ge=0,
        le=86400,
    )

    thumbnail: str | None = Field(
        default=None,
        max_length=2048,
    )

    url: str | None = Field(
        default=None,
        max_length=2048,
    )

    @field_validator("id")
    @classmethod
    def validate_video_id(cls, value: str) -> str:
        if not VIDEO_ID_RE.fullmatch(value):
            raise ValueError("Invalid music source ID.")

        return value

    @field_validator("thumbnail", "url")
    @classmethod
    def validate_optional_url(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None or value == "":
            return None

        if not value.startswith("https://"):
            raise ValueError("Only HTTPS URLs are accepted.")

        return value


class PlaylistCreate(APIModel):
    name: str = Field(
        min_length=1,
        max_length=60,
    )

    description: str = Field(
        default="",
        max_length=300,
    )

    visibility: Literal[
        "private",
        "public",
        "unlisted",
    ] = "private"

    cover_url: str | None = Field(
        default=None,
        max_length=2048,
    )

    icon: str = Field(
        default="♫",
        max_length=8,
    )

    @field_validator("cover_url")
    @classmethod
    def validate_cover_url(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None or value == "":
            return None

        if value.startswith("/media/covers/"):
            filename = value.rsplit("/", 1)[-1]

            if not re.fullmatch(
                r"[a-f0-9]{32}\.webp",
                filename,
            ):
                raise ValueError("Invalid local cover path.")

            return value

        if not value.startswith("https://"):
            raise ValueError(
                "Cover must use HTTPS or a local media path."
            )

        return value


class PlaylistUpdate(APIModel):
    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=60,
    )

    description: str | None = Field(
        default=None,
        max_length=300,
    )

    visibility: Literal[
        "private",
        "public",
        "unlisted",
    ] | None = None

    cover_url: str | None = Field(
        default=None,
        max_length=2048,
    )

    icon: str | None = Field(
        default=None,
        max_length=8,
    )

    version: int = Field(ge=1)


class ReorderTracks(APIModel):
    track_ids: list[str] = Field(
        min_length=0,
        max_length=1000,
    )

    version: int = Field(ge=1)


class ProfileUpdate(APIModel):
    handle: str | None = Field(
        default=None,
        min_length=3,
        max_length=24,
    )

    display_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=48,
    )

    bio: str | None = Field(
        default=None,
        max_length=160,
    )

    avatar_url: str | None = Field(
        default=None,
        max_length=2048,
    )

    visibility: Literal[
        "public",
        "private",
    ] | None = None

    discoverable: bool | None = None

    @field_validator("handle")
    @classmethod
    def validate_handle(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        value = value.lower()

        if not re.fullmatch(
            r"[a-z0-9_]{3,24}",
            value,
        ):
            raise ValueError(
                "Handle must contain 3–24 lowercase letters, numbers or underscores."
            )

        return value


class GroupControl(APIModel):
    action: Literal[
        "pause",
        "resume",
        "skip",
        "stop",
        "play_track",
        "queue_track",
        "play_playlist",
        "queue_playlist",
    ]

    track: TrackInput | None = None

    playlist_id: str | None = Field(
        default=None,
        min_length=8,
        max_length=64,
    )


class FollowAction(APIModel):
    action: Literal[
        "accept",
        "reject",
    ]


class CollaboratorInvite(APIModel):
    user_id: int = Field(gt=0)

    role: Literal[
        "editor",
        "contributor",
        "viewer",
    ] = "editor"


class CollaboratorRoleUpdate(APIModel):
    role: Literal[
        "editor",
        "contributor",
        "viewer",
    ]


class SettingsUpdate(APIModel):
    theme: Literal[
        "dark",
        "light",
        "system",
    ] | None = None

    language: str | None = Field(
        default=None,
        max_length=16,
    )

    audio_quality: Literal[
        "auto",
        "normal",
        "high",
    ] | None = None

    data_saver: bool | None = None

    profile_visibility: Literal[
        "public",
        "private",
    ] | None = None

    show_activity: bool | None = None

    personalized_recommendations: bool | None = None

    notification_preferences: dict[str, bool] | None = None


class AIRecommendationRequest(APIModel):
    intent: Literal[
        "for_you",
        "mood",
        "similar",
        "vibe_text",
        "playlist_generate",
        "autoplay",
    ] = "for_you"

    mood: str | None = Field(
        default=None,
        max_length=40,
    )

    vibe_text: str | None = Field(
        default=None,
        max_length=300,
    )

    seed_track: TrackInput | None = None

    count: int = Field(
        default=20,
        ge=1,
        le=30,
    )

    language: str | None = Field(
        default=None,
        max_length=16,
    )

    decade: int | None = Field(
        default=None,
        ge=1950,
        le=2030,
    )

    explicit: bool = True


class NotificationRead(APIModel):
    read: bool = True


class AdminBanRequest(APIModel):
    banned: bool

    reason: str = Field(
        default="",
        max_length=300,
    )