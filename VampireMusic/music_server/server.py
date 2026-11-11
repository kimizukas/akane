
import asyncio
import hashlib
import hmac
import json
import logging
import mimetypes
import os
import re
import time
from pathlib import Path
from urllib.parse import parse_qsl

import aiohttp
from aiohttp import web

from VampireMusic import app, config, yt, db
from VampireMusic.core.youtube import VIDEO_ID_RE
from VampireMusic.music_server.social import register_social_routes
from VampireMusic.music_server.group_api import register_group_routes


logger = logging.getLogger("VampireMusic.music_server")

BASE_DIR = Path(__file__).resolve().parent
DOWNLOAD_DIR = BASE_DIR / "downloads"
INDEX_FILE = BASE_DIR / "index.html"

HOST = os.getenv("MUSIC_SERVER_HOST", "127.0.0.1")
PORT = int(os.getenv("MUSIC_SERVER_PORT", "8088"))

AUTH_MAX_AGE = 24 * 60 * 60
MAX_REQUEST_SIZE = 1024 * 1024

_runner = None
_site = None


def verify_telegram_init_data(init_data: str):
    if not init_data or len(init_data) > 8192:
        return None

    bot_token = getattr(config, "BOT_TOKEN", None)
    if not bot_token:
        return None

    try:
        values = dict(parse_qsl(init_data, keep_blank_values=True))
        received_hash = values.pop("hash", None)
        if not received_hash:
            return None

        auth_date = int(values.get("auth_date", 0))
        now = int(time.time())
        if auth_date <= 0 or auth_date > now + 60:
            return None
        if now - auth_date > AUTH_MAX_AGE:
            return None

        check_string = "\n".join(
            f"{key}={value}" for key, value in sorted(values.items())
        )

        secret_key = hmac.new(
            b"WebAppData",
            bot_token.encode(),
            hashlib.sha256,
        ).digest()

        calculated = hmac.new(
            secret_key,
            check_string.encode(),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(calculated, received_hash):
            return None

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
        }
    except Exception:
        logger.warning("Telegram initData verification failed.")
        return None


def make_stream_token(user_id: int, video_id: str, expires: int):
    payload = f"{user_id}:{video_id}:{expires}"
    signature = hmac.new(
        config.BOT_TOKEN.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    return f"{user_id}.{expires}.{signature}"





def verify_stream_token(video_id: str, token: str):
    try:
        user_id_text, expires_text, signature = token.split(".", 2)

        user_id = int(user_id_text)
        expires = int(expires_text)
        now = int(time.time())

        max_lifetime = 6 * 60 * 60

        if user_id <= 0 or expires <= now:
            return None

        if expires > now + max_lifetime:
            return None

        expected = make_stream_token(
            user_id,
            video_id,
            expires,
        )

        expected_signature = expected.rsplit(".", 1)[-1]

        if not hmac.compare_digest(
            expected_signature,
            signature,
        ):
            return None

        return user_id

    except (ValueError, TypeError):
        return None




def _audio_content_type(ext: str):
    known = {
        "webm": "audio/webm",
        "m4a": "audio/mp4",
        "mp4": "audio/mp4",
        "opus": "audio/ogg",
        "ogg": "audio/ogg",
        "mp3": "audio/mpeg",
    }
    return (
        known.get((ext or "").lower())
        or mimetypes.guess_type(f"audio.{ext}")[0]
        or "application/octet-stream"
    )


@web.middleware
async def security_middleware(request, handler):
    response = await handler(request)
    if not response.prepared:
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )
    return response


@web.middleware
async def telegram_auth_middleware(request, handler):
    if request.path.startswith("/api/stream/"):
        return await handler(request)
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
    return web.json_response({"ok": True, "service": "VampireMusic"})


async def music_page(request):
    if not INDEX_FILE.is_file():
        raise web.HTTPNotFound(text="Mini App not installed.")
    return web.FileResponse(INDEX_FILE)


async def get_me(request):
    return web.json_response({
        "ok": True,
        "user": request["telegram_user"],
    })


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
            if not VIDEO_ID_RE.fullmatch(str(track.id)):
                continue

            expires = int(time.time()) + 900
            token = make_stream_token(user["id"], track.id, expires)

            results.append({
                "id": track.id,
                "title": track.title,
                "artist": track.channel_name or "Unknown artist",
                "duration": track.duration,
                "duration_sec": track.duration_sec,
                "thumbnail": track.thumbnail,
                "url": track.url,
                "stream_url": f"/api/stream/{track.id}?token={token}",
            })

        return web.json_response({"ok": True, "results": results})

    except Exception:
        logger.exception("Mini App search failed.")
        return web.json_response(
            {"ok": False, "error": "search_failed"},
            status=500,
        )




async def stream_track(request):
    video_id = request.match_info["video_id"]
    token = request.query.get("token", "")

    if not VIDEO_ID_RE.fullmatch(video_id):
        raise web.HTTPBadRequest(text="Invalid video ID.")

    if not verify_stream_token(video_id, token):
        raise web.HTTPForbidden(text="Invalid or expired stream token.")

    range_header = request.headers.get("Range")

    timeout = aiohttp.ClientTimeout(
        total=None,
        connect=15,
        sock_read=60,
    )

    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            for attempt in range(2):
                stream = await yt.stream(
                    video_id,
                    force_refresh=bool(attempt),
                )

                if not stream or not stream.get("url"):
                    continue

                headers = dict(stream.get("headers") or {})

                if range_header:
                    headers["Range"] = range_header

                async with session.get(
                    stream["url"],
                    headers=headers,
                    allow_redirects=True,
                ) as upstream:

                    if upstream.status == 403:
                        logger.warning(
                            "Audio CDN returned HTTP 403 for %s "
                            "(attempt %s).",
                            video_id,
                            attempt + 1,
                        )
                        continue

                    if upstream.status >= 400:
                        logger.warning(
                            "Audio CDN returned HTTP %s for %s.",
                            upstream.status,
                            video_id,
                        )
                        raise web.HTTPBadGateway(
                            text="Audio source unavailable."
                        )

                    response_headers = {
                        "Content-Type": upstream.headers.get(
                            "Content-Type",
                            _audio_content_type(
                                stream.get("ext", "webm")
                            ),
                        ),
                        "Cache-Control": "private, no-store",
                        "X-Content-Type-Options": "nosniff",
                        "Accept-Ranges": upstream.headers.get(
                            "Accept-Ranges",
                            "bytes",
                        ),
                    }

                    for name in (
                        "Content-Length",
                        "Content-Range",
                        "ETag",
                        "Last-Modified",
                    ):
                        value = upstream.headers.get(name)
                        if value:
                            response_headers[name] = value

                    response = web.StreamResponse(
                        status=upstream.status,
                        headers=response_headers,
                    )

                    await response.prepare(request)

                    async for chunk in upstream.content.iter_chunked(
                        64 * 1024
                    ):
                        await response.write(chunk)

                    await response.write_eof()
                    return response

        raise web.HTTPBadGateway(
            text="Audio source unavailable after URL refresh."
        )

    except web.HTTPException:
        raise

    except asyncio.CancelledError:
        raise

    except (
        ConnectionResetError,
        aiohttp.ClientConnectionError,
    ):
        logger.debug(
            "Mini App audio client disconnected: %s",
            video_id,
        )
        raise

    except Exception:
        logger.exception(
            "Mini App direct stream failed for %s.",
            video_id,
        )
        raise web.HTTPBadGateway(
            text="Unable to start audio stream."
        )




            

    


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
        user_in_group = user_status not in {"left", "kicked", "banned"}
    except Exception as exc:
        logger.warning(
            "User membership check failed: %s",
            type(exc).__name__,
        )
        return web.json_response(
            {"ok": False, "error": "unable_to_check_user"},
            status=400,
        )

    try:
        bot_member = await app.get_chat_member(chat_id, app.id)
        bot_status = str(bot_member.status).split(".")[-1].lower()
        bot_in_group = bot_status not in {"left", "kicked", "banned"}
    except Exception:
        bot_in_group = False

    return web.json_response({
        "ok": True,
        "chat_id": chat_id,
        "user_in_group": user_in_group,
        "bot_in_group": bot_in_group,
        "user_status": user_status,
    })





async def create_stream_token(request):
    user = request["telegram_user"]

    try:
        data = await request.json()
    except Exception:
        return web.json_response(
            {"ok": False, "error": "invalid_json"},
            status=400,
        )

    video_id = str(data.get("video_id", ""))

    if not VIDEO_ID_RE.fullmatch(video_id):
        return web.json_response(
            {"ok": False, "error": "invalid_video_id"},
            status=400,
        )

    expires = int(time.time()) + 900
    token = make_stream_token(
        int(user["id"]),
        video_id,
        expires,
    )

    return web.json_response({
        "ok": True,
        "stream_url": f"/api/stream/{video_id}?token={token}",
        "expires_at": expires,
    })




def create_app():
    application = web.Application(
        middlewares=[
            security_middleware,
            telegram_auth_middleware,
        ],
        client_max_size=MAX_REQUEST_SIZE,
    )

    social_store = register_social_routes(application, db.db)
    register_group_routes(application, social_store)

    application.router.add_get("/health", health)
    application.router.add_get("/music", music_page)
    application.router.add_get("/music/", music_page)

    application.router.add_get("/api/me", get_me)
    application.router.add_post("/api/search", search_tracks)
    application.router.add_post(
        "/api/stream-token",
        create_stream_token,
    )
    application.router.add_get(
        "/api/stream/{video_id}",
        stream_track,
    )
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

    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
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
