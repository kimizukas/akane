from __future__ import annotations

from fastapi import HTTPException, Request

from .discover import DiscoverService
from .groups import GroupService
from .repository import MusicRepository


def get_repository(request: Request) -> MusicRepository:
    repository = request.app.state.repository

    if not repository.ready:
        raise HTTPException(
            status_code=503,
            detail="social_storage_unavailable",
        )

    return repository


def get_group_service(request: Request) -> GroupService:
    return request.app.state.group_service


def get_discover_service(request: Request) -> DiscoverService:
    repository = request.app.state.repository

    if not repository.ready:
        raise HTTPException(
            status_code=503,
            detail="social_storage_unavailable",
        )

    return request.app.state.discover_service