from __future__ import annotations

from fastapi import Request

from .discover import DiscoverService
from .groups import GroupService
from .repository import MusicRepository


def get_repository(request: Request) -> MusicRepository:
    return request.app.state.repository


def get_group_service(request: Request) -> GroupService:
    return request.app.state.group_service


def get_discover_service(request: Request) -> DiscoverService:
    return request.app.state.discover_service