
import hashlib
import hmac
import logging
import os
import time
from pathlib import Path
from urllib.parse import parse_qsl
from VampireMusic import app, config, db, yt
import mimetypes
import re

from aiohttp import web

from VampireMusic import app, config, db

logger = logging.getLogger("VampireMusic.music_server")


DOWNLOAD_DIR = BASE_DIR / "downloads"
BASE_DIR = Path(__file__).resolve().parent
INDEX_FILE = BASE_DIR / "index.html"

HOST = os.getenv("MUSIC_SERVER_HOST", "127.0.0.1")
PORT = int(os.getenv("MUSIC_SERVER_PORT", "8088"))

AUTH_MAX_AGE = 24 * 60 * 60
MAX_REQUEST_SIZE = 1024 * 1024

_runner = None
_site = None


def verify_telegram_init_data(init_data: str) -> dict | None:
    """Verify Telegram Mini App initData using the bot token."""

    if not init_data or len(init_data) > 8192:
        return None

    bot_token = getattr(config, "BOT_TOKEN", None)
    if not bot_token:
        logger.error("BOT_TOKEN is not configured.")
        return None

    try:
        values = dict(parse_qsl(init_data, keep_blank_values=True))
        received_hash = values.pop("hash", None)

        if not received_hash:
            return None

        auth_date = int(values.get("auth_date", "0"))
        now = int(time.time())

        if auth_date <= 0 or auth_date > now + 60:
            return None

        if now - auth_date > AUTH_MAX_AGE:
            return None

        check_string = "\n".join(
            f"{key}={value}"
            for key, value in sorted(values.items())
        )

        secret_key = hmac.new(
            b"WebAppData",
            bot_token.encode(),
            hashlib.sha256,
        ).digest()

        calculated_hash = hmac.new(
            secret_key,
            check_string.encode(),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(calculated_hash, received_hash):
            return None

        import json

        user_data = json.loads(values.get("user", "{}"))

        if not isinstance(user_data, dict) or not user_data.get("id"):
            return None

        return {
            "id": int(user_data["id"]),
            "first_name": str(user_data.get("first_name", "")),
            "last_name": str(user_data.get("last_name", "")),
            "username": user_data.get("username"),
            "language_code": user_data.get("language_code"),
            "photo_url": user_data.get("photo_url"),
            "auth_date": auth_date,
        }

    except (ValueError, TypeError, KeyError):
        return None
    except Exception:
        logger.exception("Telegram initData verification failed.")
        return None


@web.middleware
async def security_middleware(request, handler):
    response = await handler(request)

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

    return response


@web.middleware
async def telegram_auth_middleware(request, handler):
    if not request.path.startswith("/api/"):
        return await handler(request)

    init_data = request.headers.get("X-Telegram-Init-Data", "")
    user = verify_telegram_init_data(init_data)

    if not user:
        return web.json_response(
            {"ok": False, "error": "unauthorized"},
            status=401,
        )

    request["telegram_user"] = user
    return await handler(request)


async def health(request):
    return web.json_response({
        "ok": True,
        "service": "VampireMusic",
    })


async def music_page(request):
    if not INDEX_FILE.is_file():
        raise web.HTTPNotFound(text="Music Mini App is not installed.")

    return web.FileResponse(INDEX_FILE)


async def get_me(request):
    user = request["telegram_user"]

    return web.json_response({
        "ok": True,
        "user": {
            "id": user["id"],
            "first_name": user["first_name"],
            "last_name": user["last_name"],
            "username": user["username"],
            "language_code": user["language_code"],
            "photo_url": user["photo_url"],
        },
    })




def make_stream_token(user_id: int, video_id: str, expires: int) -> str:
    payload = f"{user_id}:{video_id}:{expires}"
    secret = config.BOT_TOKEN.encode()

    signature = hmac.new(
        secret,
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()

    return f"{expires}.{signature}"


def verify_stream_token(
    user_id: int,
    video_id: str,
    token: str,
) -> bool:
    try:
        expires_text, signature = token.split(".", 1)
        expires = int(expires_text)

        if expires < int(time.time()) or expires > int(time.time()) + 3600:
            return False

        expected = make_stream_token(user_id, video_id, expires)
        return hmac.compare_digest(expected, token)

    except (ValueError, TypeError):
        return False


async def search_tracks(request):
    user = request["telegram_user"]

    try:
        data = await request.json()
    except Exception:
        return web.json_response(
            {"ok": False, "error": "invalid_json"},
            status=400,
        )

    query = str(data.get("query", "")).strip()

    if not query or len(query) > 200:
        return web.json_response(
            {"ok": False, "error": "invalid_query"},
            status=400,
        )

    try:
        tracks = await yt.search_multi(
            query=query,
            m_id=0,
            video=False,
            limit=10,
        )

        results = []

        for track in tracks:
            expires = int(time.time()) + 900
            token = make_stream_token(
                user["id"],
                track.id,
                expires,
            )

            results.append({
                "id": track.id,
                "title": track.title,
                "artist": track.channel_name,
                "duration": track.duration,
                "duration_sec": track.duration_sec,
                "thumbnail": track.thumbnail,
                "url": track.url,
                "stream_url": (
                    f"/api/stream/{track.id}?token={token}"
                ),
            })

        return web.json_response({
            "ok": True,
            "results": results,
        })

    except Exception:
        logger.exception("Mini App search failed.")
        return web.json_response(
            {"ok": False, "error": "search_failed"},
            status=500,
        )


async def stream_track(request):
    user = request["telegram_user"]
    video_id = request.match_info["video_id"]
    token = request.query.get("token", "")

    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise web.HTTPBadRequest(text="Invalid video ID.")

    if not verify_stream_token(user["id"], video_id, token):
        raise web.HTTPForbidden(text="Invalid or expired stream token.")

    try:
        file_path = await yt.download(video_id)

        if not file_path:
            raise web.HTTPNotFound(text="Audio not available.")

        path = Path(file_path).resolve()
        download_root = DOWNLOAD_DIR.resolve()

        if download_root not in path.parents or not path.is_file():
            raise web.HTTPNotFound(text="Audio file not found.")

        return web.FileResponse(
            path,
            headers={
                "Content-Type": "audio/mpeg",
                "Accept-Ranges": "bytes",
                "Cache-Control": "private, no-store",
            },
        )

    except web.HTTPException:
        raise
    except Exception:
        logger.exception("Mini App stream failed.")
        raise web.HTTPInternalServerError(text="Unable to stream audio.")






async def check_group_membership(request):
    user = request["telegram_user"]

    try:
        chat_id = int(request.match_info["chat_id"])
    except (TypeError, ValueError):
        return web.json_response(
            {"ok": False, "error": "invalid_chat_id"},
            status=400,
        )

    if chat_id >= 0:
        return web.json_response(
            {"ok": False, "error": "group_only"},
            status=400,
        )

    try:
        member = await app.get_chat_member(chat_id, user["id"])
        user_status = str(member.status).split(".")[-1].lower()

        user_in_group = user_status not in {
            "left",
            "kicked",
            "banned",
        }

    except Exception as exc:
        logger.warning(
            "Membership check failed for user=%s chat=%s: %s",
            user["id"],
            chat_id,
            type(exc).__name__,
        )

        return web.json_response({
            "ok": True,
            "user_in_group": False,
            "bot_in_group": None,
            "error": "unable_to_check_user",
        })

    try:
        bot_member = await app.get_chat_member(chat_id, app.id)
        bot_status = str(bot_member.status).split(".")[-1].lower()

        bot_in_group = bot_status not in {
            "left",
            "kicked",
            "banned",
        }

    except Exception:
        bot_in_group = False

    return web.json_response({
        "ok": True,
        "chat_id": chat_id,
        "user_in_group": user_in_group,
        "bot_in_group": bot_in_group,
        "user_status": user_status,
    })


def create_app():
    application = web.Application(
        middlewares=[
            security_middleware,
            telegram_auth_middleware,
        ],
        client_max_size=MAX_REQUEST_SIZE,
    )

    application.router.add_get("/health", health)
    application.router.add_get("/music", music_page)
    application.router.add_get("/music/", music_page)

    application.router.add_get("/api/me", get_me)
application.router.add_post("/api/search", search_tracks)
application.router.add_get("/api/stream/{video_id}", stream_track)
    application.router.add_get(
        "/api/groups/{chat_id}/membership",
        check_group_membership,
    )

    return application


async def start_server():
    global _runner, _site

    if _runner is not None:
        logger.warning("Music server is already running.")
        return

    application = create_app()
    _runner = web.AppRunner(application)

    try:
        await _runner.setup()
        _site = web.TCPSite(_runner, HOST, PORT)
        await _site.start()

        logger.info(
            "Music Mini App server started at http://%s:%s",
            HOST,
            PORT,
        )

    except Exception:
        await _runner.cleanup()
        _runner = None
        _site = None
        raise


async def stop_server():
    global _runner, _site

    if _runner is None:
        return

    try:
        await _runner.cleanup()
        logger.info("Music Mini App server stopped.")
    finally:
        _runner = None
        _site = None
