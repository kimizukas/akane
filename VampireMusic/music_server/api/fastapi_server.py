from __future__ import annotations

import asyncio
import logging
import time

import uvicorn

from VampireMusic.music_server.api.app import app
from VampireMusic.music_server.api.settings import settings


logger = logging.getLogger(
    "VampireMusic.music_server.uvicorn"
)


class EmbeddedUvicornServer(uvicorn.Server):
    """
    Uvicorn embedded in the existing bot event loop.

    Signal handling remains with VampireMusic.__main__.py, so Uvicorn
    does not replace the bot's SIGINT/SIGTERM handlers.
    """

    def install_signal_handlers(self) -> None:
        return None


_server: EmbeddedUvicornServer | None = None
_server_task: asyncio.Task | None = None


async def start_server() -> None:
    global _server, _server_task

    if _server_task and not _server_task.done():
        logger.warning(
            "FastAPI server is already running."
        )
        return

    config = uvicorn.Config(
        app,
        host=settings.host,
        port=settings.port,
        log_config=None,
        access_log=False,
        workers=1,
        lifespan="on",
        loop="asyncio",
        timeout_keep_alive=15,
        limit_concurrency=100,
        backlog=128,
    )

    _server = EmbeddedUvicornServer(config)

    _server_task = asyncio.create_task(
        _server.serve(),
        name="taalune-fastapi",
    )

    deadline = time.monotonic() + 15.0

    while not _server.started:
        if _server_task.done():
            error = _server_task.exception()

            _server = None
            _server_task = None

            if error:
                raise RuntimeError(
                    "FastAPI server failed to start."
                ) from error

            raise RuntimeError(
                "FastAPI server exited before becoming ready."
            )

        if time.monotonic() >= deadline:
            _server.should_exit = True

            try:
                await asyncio.wait_for(
                    _server_task,
                    timeout=5.0,
                )
            except asyncio.TimeoutError:
                _server_task.cancel()

            _server = None
            _server_task = None

            raise RuntimeError(
                "FastAPI server startup timed out."
            )

        await asyncio.sleep(0.05)

    logger.info(
        "FastAPI Mini App started at http://%s:%s/music/",
        settings.host,
        settings.port,
    )


async def stop_server() -> None:
    global _server, _server_task

    if _server is None or _server_task is None:
        return

    logger.info(
        "Stopping FastAPI Mini App server."
    )

    _server.should_exit = True

    try:
        await asyncio.wait_for(
            _server_task,
            timeout=15.0,
        )

    except asyncio.TimeoutError:
        logger.warning(
            "FastAPI graceful shutdown timed out; cancelling server task."
        )

        _server_task.cancel()

        await asyncio.gather(
            _server_task,
            return_exceptions=True,
        )

    finally:
        _server = None
        _server_task = None

    logger.info(
        "FastAPI Mini App server stopped."
    )