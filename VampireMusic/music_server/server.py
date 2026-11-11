
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
from urllib.parse import parse_qsl, urlparse

import aiohttp
from aiohttp import web

from VampireMusic import app, config, yt, db
from VampireMusic.core.youtube import VIDEO_ID_RE
from VampireMusic.music_server.social import register_social_routes
from VampireMusic.music_server.group_api import register_group_routes


logger = logging.getLogger("VampireMusic.music_server")

BASE_DIR = Path(__file__).resolve().parent
DOWNLOAD_DIR = BASE_DIR / "downloads"
ASSETS_DIR = BASE_DIR / "assets"
INDEX_FILE = BASE_DIR / "index.html"

HOST = os.getenv("MUSIC_SERVER_HOST", "127.0.0.1")
PORT = int(os.getenv("MUSIC_SERVER_PORT", "8088"))

AUTH_MAX_AGE = 24 * 60 * 60

MAX_COVER_SIZE = 5 * 1024 * 1024
MAX_REQUEST_SIZE = MAX_COVER_SIZE + (128 * 1024)

CATBOX_API_URL = "https://catbox.moe/user/api.php"

_COVER_UPLOAD_COOLDOWN = 8
_COVER_UPLOAD_LAST = {}
_CATBOX_UPLOAD_SEMAPHORE = asyncio.Semaphore(2)

_GEMINI_QUERY_CACHE = {}
_GEMINI_QUERY_CACHE_TTL = 900

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
            f"{key}={value}"
            for key, value in sorted(values.items())
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
        response.headers["Referrer-Policy"] = (
            "strict-origin-when-cross-origin"
        )
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

    init_data = request.headers.get(
        "X-Telegram-Init-Data",
        "",
    )

    user = verify_telegram_init_data(init_data)

    if not user:
        return web.json_response(
            {
                "ok": False,
                "error": "unauthorized",
            },
            status=401,
        )

    request["telegram_user"] = user

    return await handler(request)
async def _gemini_recommendation_queries(history):
    api_key = os.getenv("GEMINI_API_KEY", "").strip()

    if not api_key or not history:
        return []

    seeds = []

    for item in history[:12]:
        title = str(item.get("title", "")).strip()
        artist = str(item.get("artist", "")).strip()

        if not title:
            continue

        seeds.append({
            "title": title[:120],
            "artist": artist[:100],
        })

    if not seeds:
        return []

    fingerprint = hashlib.sha256(
        json.dumps(
            seeds,
            ensure_ascii=False,
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()

    now = time.monotonic()
    cached = _GEMINI_QUERY_CACHE.get(fingerprint)

    if cached and cached["expires"] > now:
        return cached["queries"]

    model = re.sub(
        r"[^A-Za-z0-9._-]",
        "",
        os.getenv(
            "GEMINI_MODEL",
            "gemini-3.8-flash",
        ).strip(),
    )

    if not model:
        model = "gemini-3.8-flash"

    prompt = (
        "You are a music recommendation engine. "
        "Use the listener's recent music history below. "
        "Create exactly two different YouTube music search queries. "
        "Recommend related artists, similar songs, new releases, "
        "and nearby genres. Do not repeat the exact tracks supplied. "
        "Do not write explanations. Return valid JSON only, "
        'in this format: {"queries":["query one","query two"]}. '
        "Listening history: "
        + json.dumps(seeds, ensure_ascii=False)
    )

    url = (
        "https://generativelanguage.googleapis.com/v1beta/"
        f"models/{model}:generateContent"
    )

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": prompt}
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.45,
            "maxOutputTokens": 160,
            "responseMimeType": "application/json",
        },
    }

    timeout = aiohttp.ClientTimeout(
        total=8,
        connect=3,
        sock_read=5,
    )

    try:
        async with aiohttp.ClientSession(
            timeout=timeout,
        ) as session:
            async with session.post(
                url,
                headers={
                    "x-goog-api-key": api_key,
                    "Content-Type": "application/json",
                },
                json=payload,
            ) as response:

                if response.status != 200:
                    logger.warning(
                        "Gemini recommendation returned HTTP %s.",
                        response.status,
                    )
                    return []

                result = await response.json()

        candidates = result.get("candidates") or []

        if not candidates:
            return []

        parts = (
            candidates[0]
            .get("content", {})
            .get("parts", [])
        )

        raw = "".join(
            str(part.get("text", ""))
            for part in parts
            if isinstance(part, dict)
        ).strip()

        if not raw:
            return []

        raw = re.sub(
            r"^```(?:json)?|```$",
            "",
            raw.strip(),
            flags=re.IGNORECASE,
        ).strip()

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            match = re.search(
                r"\{[\s\S]*\}",
                raw,
            )

            if not match:
                return []

            parsed = json.loads(match.group(0))

        queries = parsed.get("queries", [])

        if not isinstance(queries, list):
            return []

        queries = [
            str(query).strip()[:120]
            for query in queries
            if isinstance(query, str) and query.strip()
        ][:2]

        _GEMINI_QUERY_CACHE[fingerprint] = {
            "queries": queries,
            "expires": now + _GEMINI_QUERY_CACHE_TTL,
        }

        if len(_GEMINI_QUERY_CACHE) > 256:
            expired = [
                key
                for key, value in _GEMINI_QUERY_CACHE.items()
                if value["expires"] <= now
            ]

            for key in expired:
                _GEMINI_QUERY_CACHE.pop(key, None)

            while len(_GEMINI_QUERY_CACHE) > 256:
                _GEMINI_QUERY_CACHE.pop(
                    next(iter(_GEMINI_QUERY_CACHE))
                )

        return queries

    except asyncio.CancelledError:
        raise

    except Exception as exc:
        logger.warning(
            "Gemini recommendation failed: %s",
            type(exc).__name__,
        )
        return []


async def recommendations(request):
    store = request.app.get("social_store")

    if not store or not store.ready:
        return web.json_response(
            {
                "ok": False,
                "error": "social_storage_unavailable",
            },
            status=503,
        )

    user_id = int(request["telegram_user"]["id"])

    history_doc = await store.listening_history.find_one({
        "_id": user_id,
    }) or {}

    history = history_doc.get("items", [])

    liked_cursor = store.track_likes.find({
        "user_id": user_id,
    }).sort(
        "created_at",
        -1,
    ).limit(12)

    liked = [
        item.get("track", {})
        async for item in liked_cursor
    ]

    seeds = []
    seen = set()

    for item in [*history, *liked]:
        track_id = str(item.get("id", "")).strip()

        if not track_id or track_id in seen:
            continue

        seen.add(track_id)
        seeds.append(item)

    queries = await _gemini_recommendation_queries(
        seeds
    )

    if not queries and seeds:
        first = seeds[0]
        title = str(first.get("title", "")).strip()
        artist = str(first.get("artist", "")).strip()

        if artist and artist.lower() != "unknown artist":
            queries = [
                f"songs similar to {title} by {artist}",
                f"new songs by {artist}",
            ]
        else:
            queries = [
                f"songs similar to {title}",
            ]

    if not queries:
        language = str(
            request["telegram_user"].get("language_code") or ""
        ).lower().split("-")[0]

        language_queries = {
            "hi": "new Hindi songs",
            "ur": "new Urdu songs",
            "bn": "new Bengali songs",
            "pa": "new Punjabi songs",
            "ta": "new Tamil songs",
            "te": "new Telugu songs",
            "ml": "new Malayalam songs",
            "en": "new international songs",
        }

        queries = [
            language_queries.get(
                language,
                "new popular music",
            )
        ]

    searches = await asyncio.gather(
        *[
            yt.search_multi(
                query=query,
                m_id=0,
                video=False,
                limit=10,
            )
            for query in queries[:2]
        ],
        return_exceptions=True,
    )

    excluded = {
        str(item.get("id", ""))
        for item in seeds[:15]
    }

    results = []
    result_ids = set()

    for tracks in searches:
        if isinstance(tracks, Exception):
            continue

        for track in tracks or []:
            track_id = str(getattr(track, "id", ""))

            if (
                not VIDEO_ID_RE.fullmatch(track_id)
                or track_id in excluded
                or track_id in result_ids
            ):
                continue

            result_ids.add(track_id)

            results.append({
                "id": track_id,
                "title": track.title,
                "artist": (
                    track.channel_name or "Unknown artist"
                ),
                "duration": track.duration,
                "duration_sec": int(
                    track.duration_sec or 0
                ),
                "thumbnail": track.thumbnail,
                "url": track.url,
            })

            if len(results) >= 16:
                break

        if len(results) >= 16:
            break

    personalized = bool(seeds)

    return web.json_response({
        "ok": True,
        "results": results,
        "personalized": personalized,
        "reason": (
            "Based on your recent listening and liked songs."
            if personalized
            else "Start listening and liking songs to build your personal mix."
        ),
    })

async def health(request):
    return web.json_response({
        "ok": True,
        "service": "VampireMusic",
    })


async def music_page(request):
    if not INDEX_FILE.is_file():
        raise web.HTTPNotFound(
            text="Mini App not installed."
        )

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
            {
                "ok": False,
                "error": "invalid_json",
            },
            status=400,
        )

    if not isinstance(data, dict):
        return web.json_response(
            {
                "ok": False,
                "error": "invalid_json",
            },
            status=400,
        )

    query = str(data.get("query", "")).strip()

    if not query or len(query) > 200:
        return web.json_response(
            {
                "ok": False,
                "error": "invalid_query",
            },
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

            results.append({
                "id": track.id,
                "title": track.title,
                "artist": track.channel_name or "Unknown artist",
                "duration": track.duration,
                "duration_sec": track.duration_sec,
                "thumbnail": track.thumbnail,
                "url": track.url,
            })

        return web.json_response({
            "ok": True,
            "results": results,
        })

    except Exception:
        logger.exception("Mini App search failed.")

        return web.json_response(
            {
                "ok": False,
                "error": "search_failed",
            },
            status=500,
        )




async def upload_cover(request):
    user = request["telegram_user"]
    user_id = int(user["id"])

    if (
        request.content_length is not None
        and request.content_length > MAX_REQUEST_SIZE
    ):
        return web.json_response(
            {"ok": False, "error": "image_too_large"},
            status=413,
        )

    try:
        reader = await request.multipart()
    except Exception:
        return web.json_response(
            {"ok": False, "error": "invalid_multipart"},
            status=400,
        )

    file_part = None

    try:
        while True:
            part = await reader.next()

            if part is None:
                break

            if part.name == "fileToUpload":
                file_part = part
                break

    except Exception:
        return web.json_response(
            {"ok": False, "error": "invalid_multipart"},
            status=400,
        )

    if file_part is None or not file_part.filename:
        return web.json_response(
            {"ok": False, "error": "image_required"},
            status=400,
        )

    chunks = []
    total = 0

    try:
        while True:
            chunk = await file_part.read_chunk(64 * 1024)

            if not chunk:
                break

            total += len(chunk)

            if total > MAX_COVER_SIZE:
                return web.json_response(
                    {"ok": False, "error": "image_too_large"},
                    status=413,
                )

            chunks.append(chunk)

    except Exception:
        return web.json_response(
            {"ok": False, "error": "invalid_image"},
            status=400,
        )

    image_data = b"".join(chunks)

    if not image_data:
        return web.json_response(
            {"ok": False, "error": "image_required"},
            status=400,
        )

    if image_data.startswith(b"\xff\xd8\xff"):
        mime_type = "image/jpeg"
        extension = "jpg"

    elif image_data.startswith(b"\x89PNG\r\n\x1a\n"):
        mime_type = "image/png"
        extension = "png"

    elif (
        len(image_data) >= 12
        and image_data[:4] == b"RIFF"
        and image_data[8:12] == b"WEBP"
    ):
        mime_type = "image/webp"
        extension = "webp"

    else:
        return web.json_response(
            {"ok": False, "error": "unsupported_image"},
            status=415,
        )

    now = time.monotonic()
    last_upload = _COVER_UPLOAD_LAST.get(user_id, 0.0)

    if now - last_upload < _COVER_UPLOAD_COOLDOWN:
        return web.json_response(
            {"ok": False, "error": "upload_rate_limited"},
            status=429,
        )

    _COVER_UPLOAD_LAST[user_id] = now

    if len(_COVER_UPLOAD_LAST) > 512:
        oldest_user_id = next(iter(_COVER_UPLOAD_LAST))
        _COVER_UPLOAD_LAST.pop(oldest_user_id, None)

    form = aiohttp.FormData()

    form.add_field("reqtype", "fileupload")

    userhash = os.getenv("CATBOX_USERHASH", "").strip()

    if userhash:
        form.add_field("userhash", userhash)

    form.add_field(
        "fileToUpload",
        image_data,
        filename=f"taalune-cover.{extension}",
        content_type=mime_type,
    )

    timeout = aiohttp.ClientTimeout(
        total=45,
        connect=15,
        sock_read=30,
    )

    try:
        async with _CATBOX_UPLOAD_SEMAPHORE:
            async with aiohttp.ClientSession(
                timeout=timeout,
                headers={
                    "User-Agent": "TaaluneMusic/1.0",
                },
            ) as session:
                async with session.post(
                    CATBOX_API_URL,
                    data=form,
                    allow_redirects=True,
                ) as response:
                    result = (await response.text()).strip()
                    status_code = response.status

    except asyncio.CancelledError:
        raise

    except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
        logger.warning(
            "Catbox connection failed for user %s: %s",
            user_id,
            type(exc).__name__,
        )

        return web.json_response(
            {"ok": False, "error": "catbox_unavailable"},
            status=502,
        )

    if status_code != 200:
        safe_detail = re.sub(
            r"[\r\n\t]+",
            " ",
            result,
        )[:160]

        logger.warning(
            "Catbox rejected upload: HTTP %s, user=%s, response=%r",
            status_code,
            user_id,
            safe_detail,
        )

        return web.json_response(
            {"ok": False, "error": "catbox_unavailable"},
            status=502,
        )

    parsed = urlparse(result)

    valid_url = (
        len(result) <= 2048
        and parsed.scheme == "https"
        and parsed.hostname == "files.catbox.moe"
        and not parsed.username
        and not parsed.password
        and bool(parsed.path)
        and parsed.path.startswith("/")
        and not parsed.query
        and not parsed.fragment
    )

    if not valid_url:
        safe_detail = re.sub(
            r"[\r\n\t]+",
            " ",
            result,
        )[:160]

        logger.warning(
            "Catbox returned a non-URL response for user %s: %r",
            user_id,
            safe_detail,
        )

        return web.json_response(
            {
                "ok": False,
                "error": "catbox_rejected",
            },
            status=502,
        )

    return web.json_response({
        "ok": True,
        "url": result,
    })






async def stream_track(request):
    video_id = request.match_info["video_id"]
    token = request.query.get("token", "")

    if not VIDEO_ID_RE.fullmatch(video_id):
        raise web.HTTPBadRequest(
            text="Invalid video ID."
        )

    if not verify_stream_token(video_id, token):
        raise web.HTTPForbidden(
            text="Invalid or expired stream token."
        )

    range_header = request.headers.get("Range")

    timeout = aiohttp.ClientTimeout(
        total=None,
        connect=15,
        sock_read=60,
    )

    response = None

    try:
        async with aiohttp.ClientSession(
            timeout=timeout,
            auto_decompress=False,
        ) as session:

            for attempt in range(2):
                stream = await yt.stream(
                    video_id,
                    force_refresh=bool(attempt),
                )

                if not stream or not stream.get("url"):
                    continue

                headers = dict(
                    stream.get("headers") or {}
                )

                headers["Accept-Encoding"] = "identity"

                if range_header:
                    headers["Range"] = range_header

                async with session.get(
                    stream["url"],
                    headers=headers,
                    allow_redirects=True,
                ) as upstream:

                    if upstream.status in {401, 403, 410}:
                        logger.warning(
                            "Audio CDN returned HTTP %s for %s "
                            "(attempt %s).",
                            upstream.status,
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

                    if upstream.status not in {200, 206}:
                        raise web.HTTPBadGateway(
                            text="Unexpected audio source response."
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

    except ConnectionResetError:
        # The browser/WebView closed its audio connection.
        # Do not turn this normal cancellation into an aiohttp ERROR.
        logger.debug(
            "Mini App audio client disconnected: %s",
            video_id,
        )

        if response is not None and response.prepared:
            return response

        return web.Response(status=499)

    except aiohttp.ClientConnectionError:
        if response is not None and response.prepared:
            logger.warning(
                "Audio upstream connection ended after streaming began: %s",
                video_id,
            )
            return response

        logger.warning(
            "Audio upstream connection failed for %s.",
            video_id,
        )

        raise web.HTTPBadGateway(
            text="Audio source connection failed."
        )

    except Exception:
        if response is not None and response.prepared:
            logger.exception(
                "Audio stream ended unexpectedly after response started: %s",
                video_id,
            )
            return response

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
            {
                "ok": False,
                "error": "invalid_chat_id",
            },
            status=400,
        )

    if chat_id >= 0:
        return web.json_response(
            {
                "ok": False,
                "error": "group_only",
            },
            status=400,
        )

    try:
        member = await app.get_chat_member(
            chat_id,
            user["id"],
        )

        user_status = str(member.status).split(".")[-1].lower()

        user_in_group = user_status not in {
            "left",
            "kicked",
            "banned",
        }

    except Exception as exc:
        logger.warning(
            "User membership check failed: %s",
            type(exc).__name__,
        )

        return web.json_response(
            {
                "ok": False,
                "error": "unable_to_check_user",
            },
            status=400,
        )

    try:
        bot_member = await app.get_chat_member(
            chat_id,
            app.id,
        )

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


async def prefetch_stream(request):
    try:
        data = await request.json()

    except Exception:
        return web.json_response(
            {
                "ok": False,
                "error": "invalid_json",
            },
            status=400,
        )

    if not isinstance(data, dict):
        return web.json_response(
            {
                "ok": False,
                "error": "invalid_json",
            },
            status=400,
        )

    video_id = str(data.get("video_id", "")).strip()

    if not VIDEO_ID_RE.fullmatch(video_id):
        return web.json_response(
            {
                "ok": False,
                "error": "invalid_video_id",
            },
            status=400,
        )

    stream = await yt.stream(video_id)

    if not stream or not stream.get("url"):
        return web.json_response(
            {
                "ok": False,
                "error": "stream_unavailable",
            },
            status=502,
        )

    return web.json_response({
        "ok": True,
        "prefetched": True,
    })




async def create_stream_token(request):
    user = request["telegram_user"]

    try:
        data = await request.json()

    except Exception:
        return web.json_response(
            {
                "ok": False,
                "error": "invalid_json",
            },
            status=400,
        )

    if not isinstance(data, dict):
        return web.json_response(
            {
                "ok": False,
                "error": "invalid_json",
            },
            status=400,
        )

    video_id = str(data.get("video_id", ""))

    if not VIDEO_ID_RE.fullmatch(video_id):
        return web.json_response(
            {
                "ok": False,
                "error": "invalid_video_id",
            },
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
    ASSETS_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    application = web.Application(
        middlewares=[
            security_middleware,
            telegram_auth_middleware,
        ],
        client_max_size=MAX_REQUEST_SIZE,
    )

    social_store = register_social_routes(
        application,
        db.db,
    )

    register_group_routes(
        application,
        social_store,
    )

    application.router.add_get(
        "/health",
        health,
    )

    application.router.add_get(
        "/music",
        music_page,
    )

    application.router.add_get(
        "/music/",
        music_page,
    )

    application.router.add_static(
        "/music/assets/",
        ASSETS_DIR,
        name="music-assets",
        show_index=False,
    )

    application.router.add_get(
        "/api/me",
        get_me,
    )

    application.router.add_post(
        "/api/search",
        search_tracks,
    )

    application.router.add_post(
        "/api/upload/cover",
        upload_cover,
    )

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
    application.router.add_get(
    "/api/recommendations",
    recommendations,
)
    application.router.add_post(
    "/api/stream-prefetch",
    prefetch_stream,
)

    return application


async def start_server():
    global _runner, _site

    if _runner is not None:
        logger.warning(
            "Music server is already running."
        )
        return

    DOWNLOAD_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    ASSETS_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    application = create_app()

    _runner = web.AppRunner(application)

    try:
        await _runner.setup()

        _site = web.TCPSite(
            _runner,
            HOST,
            PORT,
        )

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

        logger.info(
            "Music Mini App server stopped."
        )

    finally:
        _runner = None
        _site = None