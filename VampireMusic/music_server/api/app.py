from __future__ import annotations

import asyncio
import logging
import secrets
import time

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import (
    FastAPI,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
)

from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import (
    FileResponse,
    JSONResponse,
    RedirectResponse,
)

from fastapi.staticfiles import StaticFiles

from VampireMusic import db, logger

from .auth import router as auth_router
from .dependencies import (
    get_group_service,
)
from .discover import (
    DiscoverError,
    create_discover_service,
)
from .events import event_hub
from .groups import (
    GroupService,
    GroupServiceError,
)
from .music import router as music_router
from .repository import (
    MusicRepository,
    RepositoryError,
)
from .routers.admin import router as admin_router
from .routers.groups import router as groups_router
from .routers.social import router as social_router
from .security import decode_access_token
from .settings import settings
from .routers.safety import router as safety_router

logger = logging.getLogger(
    "VampireMusic.music_server.api"
)

BASE_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIST = BASE_DIR / "dist"


@asynccontextmanager
async def lifespan(application: FastAPI):
    settings.upload_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    repository = MusicRepository()
    application.state.repository = repository

    application.state.group_service = GroupService(
        repository,
    )

    application.state.discover_service = create_discover_service(
        repository,
    )

    application.state.upload_limits = {}
    application.state.upload_lock = asyncio.Lock()

    try:
        await repository.ensure_indexes()

        logger.info(
            "Taalune MongoDB indexes are ready."
        )

    except asyncio.CancelledError:
        raise

    except Exception:
        repository.ready = False

        logger.exception(
            "Taalune social storage initialization failed."
        )

        # The FastAPI process may still serve health checks and group
        # endpoints. Repository-backed endpoints report storage unavailable.
    else:
        application.state.repository_ready = True

    application.state.repository_ready = repository.ready

    logger.info(
        "Taalune FastAPI backend started."
    )

    try:
        yield

    finally:
        logger.info(
            "Taalune FastAPI backend stopping."
        )


def create_app() -> FastAPI:
    application = FastAPI(
        title="Taalune Music API",
        description=(
            "Telegram Mini App API for personal listening, "
            "playlists, social features, Discover and group voice chats."
        ),
        version="1.0.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )

    if settings.cors_origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_origins),
            allow_credentials=False,
            allow_methods=[
                "GET",
                "POST",
                "PATCH",
                "PUT",
                "DELETE",
                "OPTIONS",
            ],
            allow_headers=[
                "Authorization",
                "Content-Type",
                "X-Telegram-Init-Data",
                "X-Request-ID",
                "Idempotency-Key",
            ],
            expose_headers=[
                "X-Request-ID",
                "Retry-After",
            ],
            max_age=600,
        )

    @application.middleware("http")
    async def security_headers(
        request: Request,
        call_next,
    ):
        supplied_id = request.headers.get(
            "X-Request-ID",
            "",
        ).strip()

        if (
            8 <= len(supplied_id) <= 80
            and all(
                character.isalnum()
                or character in "-_"
                for character in supplied_id
            )
        ):
            request_id = supplied_id
        else:
            request_id = secrets.token_hex(16)

        request.state.request_id = request_id

        try:
            response = await call_next(request)

        except asyncio.CancelledError:
            raise

        except Exception:
            logger.exception(
                "Unhandled API error. request_id=%s method=%s path=%s",
                request_id,
                request.method,
                request.url.path,
            )

            response = JSONResponse(
                status_code=500,
                content={
                    "ok": False,
                    "error": "internal_server_error",
                    "request_id": request_id,
                },
            )

        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Referrer-Policy"] = (
            "strict-origin-when-cross-origin"
        )
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )
        response.headers["Cache-Control"] = "no-store"

        return response

    @application.exception_handler(RepositoryError)
    async def repository_error_handler(
        request: Request,
        exc: RepositoryError,
    ):
        return JSONResponse(
            status_code=exc.status,
            content={
                "ok": False,
                "error": exc.code,
                "message": exc.message,
                "request_id": getattr(
                    request.state,
                    "request_id",
                    None,
                ),
            },
        )

    @application.exception_handler(GroupServiceError)
    async def group_error_handler(
        request: Request,
        exc: GroupServiceError,
    ):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "ok": False,
                "error": exc.code,
                "message": exc.message,
                "request_id": getattr(
                    request.state,
                    "request_id",
                    None,
                ),
            },
        )

    @application.exception_handler(DiscoverError)
    async def discover_error_handler(
        request: Request,
        exc: DiscoverError,
    ):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "ok": False,
                "error": str(exc),
                "request_id": getattr(
                    request.state,
                    "request_id",
                    None,
                ),
            },
        )

    @application.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request,
        exc: RequestValidationError,
    ):
        errors = []

        for item in exc.errors()[:20]:
            location = ".".join(
                str(part)
                for part in item.get("loc", [])
            )

            errors.append({
                "field": location,
                "code": str(item.get("type", "invalid_value")),
            })

        return JSONResponse(
            status_code=422,
            content={
                "ok": False,
                "error": "validation_error",
                "fields": errors,
                "request_id": getattr(
                    request.state,
                    "request_id",
                    None,
                ),
            },
        )

    @application.exception_handler(HTTPException)
    async def http_error_handler(
        request: Request,
        exc: HTTPException,
    ):
        detail = exc.detail

        if isinstance(detail, str):
            code = detail
            message = detail.replace("_", " ")

        elif isinstance(detail, dict):
            code = str(
                detail.get("error", "request_failed")
            )
            message = str(
                detail.get("message", code)
            )

        else:
            code = "request_failed"
            message = "The request could not be completed."

        return JSONResponse(
            status_code=exc.status_code,
            headers=exc.headers,
            content={
                "ok": False,
                "error": code,
                "message": message,
                "request_id": getattr(
                    request.state,
                    "request_id",
                    None,
                ),
            },
        )

    # API modules
    application.include_router(auth_router)
    application.include_router(music_router)
    application.include_router(social_router)
    application.include_router(groups_router)
    application.include_router(admin_router)
    application.include_router(safety_router)

    # -----------------------------------------------------
    # Health
    # -----------------------------------------------------

    @application.get("/health")
    async def health():
        return {
            "ok": True,
            "service": "Taalune FastAPI",
            "backend": "fastapi",
            "database_connected": bool(
                getattr(db, "connected", False)
            ),
        }

    @application.get("/api/ready")
    async def readiness():
        repository = getattr(
            application.state,
            "repository",
            None,
        )

        ready = bool(
            repository
            and repository.ready
            and getattr(db, "connected", False)
        )

        return JSONResponse(
            status_code=200 if ready else 503,
            content={
                "ok": ready,
                "service": "Taalune",
                "database": (
                    "ready"
                    if ready
                    else "unavailable"
                ),
            },
        )

    # -----------------------------------------------------
    # Frontend delivery
    # -----------------------------------------------------

    application.mount(
        "/media/covers",
        StaticFiles(
            directory=str(settings.upload_directory),
            check_dir=False,
        ),
        name="music-covers",
    )

    application.mount(
        "/music/assets",
        StaticFiles(
            directory=str(FRONTEND_DIST / "assets"),
            check_dir=False,
        ),
        name="music-assets",
    )

    @application.get("/")
    async def root():
        return RedirectResponse(
            "/music/",
            status_code=307,
        )

    @application.get("/music")
    async def music_page_redirect():
        return RedirectResponse(
            "/music/",
            status_code=307,
        )

    @application.get("/music/")
    async def music_page():
        index_file = FRONTEND_DIST / "index.html"

        if not index_file.is_file():
            return JSONResponse(
                status_code=503,
                content={
                    "ok": False,
                    "error": "frontend_not_built",
                    "message": (
                        "The Mini App frontend has not been built yet."
                    ),
                },
            )

        return FileResponse(
            index_file,
            media_type="text/html",
            headers={
                "Cache-Control": "no-cache",
            },
        )

    @application.get("/music/{path:path}")
    async def music_spa_fallback(path: str):
        # The Vite frontend is a single-page application.
        # Static asset paths are handled by the mount above.
        index_file = FRONTEND_DIST / "index.html"

        if not index_file.is_file():
            raise HTTPException(
                status_code=503,
                detail="frontend_not_built",
            )

        return FileResponse(
            index_file,
            media_type="text/html",
            headers={
                "Cache-Control": "no-cache",
            },
        )

    # -----------------------------------------------------
    # WebSocket
    # -----------------------------------------------------

    @application.websocket("/api/ws")
    async def websocket_endpoint(
        websocket: WebSocket,
    ):
        token = websocket.query_params.get(
            "token",
            "",
        )

        user = decode_access_token(token)

        if not user:
            await websocket.close(
                code=4401,
                reason="Authentication required.",
            )
            return

        profile = await db.db.music_profiles.find_one({
            "_id": int(user["id"]),
        })

        if profile and profile.get("banned"):
            await websocket.close(
                code=4403,
                reason="Account unavailable.",
            )
            return

        await websocket.accept()

        event_queue = await event_hub.subscribe(
            f"user:{int(user['id'])}",
        )

        await websocket.send_json({
            "type": "connected",
            "user_id": int(user["id"]),
            "server_time": int(time.time()),
        })

        send_task = asyncio.create_task(
            event_queue.get()
        )

        receive_task = asyncio.create_task(
            websocket.receive_json()
        )

        try:
            while True:
                done, _pending = await asyncio.wait(
                    {
                        send_task,
                        receive_task,
                    },
                    timeout=25.0,
                    return_when=asyncio.FIRST_COMPLETED,
                )

                if not done:
                    await websocket.send_json({
                        "type": "heartbeat",
                        "server_time": int(time.time()),
                    })
                    continue

                if send_task in done:
                    event = send_task.result()

                    await websocket.send_json(event)

                    send_task = asyncio.create_task(
                        event_queue.get()
                    )

                if receive_task in done:
                    incoming = receive_task.result()

                    if not isinstance(incoming, dict):
                        await websocket.send_json({
                            "type": "error",
                            "error": "invalid_message",
                        })

                    elif incoming.get("type") == "ping":
                        await websocket.send_json({
                            "type": "pong",
                            "server_time": int(time.time()),
                        })

                    elif incoming.get("type") == "subscribe_group":
                        try:
                            chat_id = int(
                                incoming.get("chat_id")
                            )

                            group_service: GroupService = (
                                application.state.group_service
                            )

                            await group_service.context(
                                int(user["id"]),
                                chat_id,
                                require_control=False,
                            )

                            await event_hub.add_topic(
                                event_queue,
                                f"group:{chat_id}",
                            )

                            group = await group_service.status(
                                int(user["id"]),
                                chat_id,
                            )

                            await websocket.send_json({
                                "type": "group.snapshot",
                                "group": group,
                            })

                        except GroupServiceError as exc:
                            await websocket.send_json({
                                "type": "error",
                                "error": exc.code,
                            })

                        except (
                            TypeError,
                            ValueError,
                        ):
                            await websocket.send_json({
                                "type": "error",
                                "error": "invalid_chat_id",
                            })

                    else:
                        await websocket.send_json({
                            "type": "error",
                            "error": "unsupported_message",
                        })

                    receive_task = asyncio.create_task(
                        websocket.receive_json()
                    )

        except WebSocketDisconnect:
            pass

        except asyncio.CancelledError:
            raise

        except Exception:
            logger.debug(
                "Mini App WebSocket disconnected for user %s.",
                user["id"],
                exc_info=True,
            )

        finally:
            for task in (
                send_task,
                receive_task,
            ):
                if not task.done():
                    task.cancel()

            await asyncio.gather(
                send_task,
                receive_task,
                return_exceptions=True,
            )

            await event_hub.unsubscribe_all(
                event_queue,
            )

    return application


app = create_app()