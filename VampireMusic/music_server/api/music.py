from __future__ import annotations

import asyncio
import logging
import re
import uuid

from io import BytesIO
from pathlib import Path
from typing import Any

import httpx

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)

from fastapi.responses import (
    Response,
    StreamingResponse,
)

from PIL import Image, UnidentifiedImageError

from VampireMusic import yt
from VampireMusic.core.youtube import VIDEO_ID_RE

from .dependencies import (
    get_discover_service,
)
from .discover import (
    DiscoverError,
    DiscoverService,
)
from .schemas import (
    AIRecommendationRequest,
    APIModel,
)
from .security import (
    create_signed_stream_token,
    get_current_user,
    verify_signed_stream_token,
)
from .settings import settings


logger = logging.getLogger(
    "VampireMusic.music_server.api.music"
)

router = APIRouter(
    prefix="/api",
    tags=["Music"],
)


class SearchRequest(APIModel):
    query: str
    limit: int = 10


class StreamTokenRequest(APIModel):
    video_id: str


def _serialize_search_track(track: Any) -> dict[str, Any] | None:
    track_id = str(
        getattr(track, "id", "") or ""
    ).strip()

    if not VIDEO_ID_RE.fullmatch(track_id):
        return None

    title = str(
        getattr(track, "title", "") or ""
    ).strip()

    if not title:
        return None

    try:
        duration = int(
            getattr(track, "duration_sec", 0) or 0
        )
    except (TypeError, ValueError):
        duration = 0

    return {
        "id": track_id,
        "title": title[:160],
        "artist": str(
            getattr(track, "channel_name", "")
            or "Unknown artist"
        )[:160],
        "duration": str(
            getattr(track, "duration", "") or ""
        ),
        "duration_sec": max(0, min(duration, 86400)),
        "thumbnail": getattr(track, "thumbnail", None),
        "url": getattr(track, "url", None),
    }


async def _search_music(
    query: str,
    limit: int,
) -> list[dict[str, Any]]:
    query = str(query or "").strip()

    if not query or len(query) > 200:
        raise HTTPException(
            status_code=400,
            detail="invalid_query",
        )

    limit = max(1, min(int(limit), 20))

    try:
        tracks = await yt.search_multi(
            query=query,
            m_id=0,
            video=False,
            limit=limit,
        )

    except asyncio.CancelledError:
        raise

    except Exception as exc:
        logger.exception(
            "Music search failed.",
        )

        raise HTTPException(
            status_code=502,
            detail="search_failed",
        ) from exc

    results = []
    seen = set()

    for track in tracks or []:
        item = _serialize_search_track(track)

        if not item:
            continue

        if item["id"] in seen:
            continue

        seen.add(item["id"])
        results.append(item)

    return results


@router.post("/search")
async def search_tracks(
    payload: SearchRequest,
    user: dict = Depends(get_current_user),
):
    results = await _search_music(
        payload.query,
        payload.limit,
    )

    return {
        "ok": True,
        "results": results,
        "count": len(results),
    }


@router.get("/search/music")
async def search_music_get(
    q: str = Query(min_length=1, max_length=200),
    limit: int = Query(default=10, ge=1, le=20),
    user: dict = Depends(get_current_user),
):
    results = await _search_music(
        q,
        limit,
    )

    return {
        "ok": True,
        "results": results,
        "count": len(results),
    }


@router.post("/stream-token")
async def create_stream_token(
    payload: StreamTokenRequest,
    user: dict = Depends(get_current_user),
):
    video_id = payload.video_id.strip()

    if not VIDEO_ID_RE.fullmatch(video_id):
        raise HTTPException(
            status_code=400,
            detail="invalid_video_id",
        )

    # Resolve before issuing a token. This catches unavailable sources
    # before the HTML audio element tries to load the stream.
    try:
        stream = await yt.stream(video_id)

    except asyncio.CancelledError:
        raise

    except Exception as exc:
        logger.warning(
            "Stream preflight failed for %s: %s",
            video_id,
            type(exc).__name__,
        )
        stream = None

    if not stream or not stream.get("url"):
        raise HTTPException(
            status_code=502,
            detail="stream_unavailable",
        )

    import time

    expires = int(time.time()) + 15 * 60

    token = create_signed_stream_token(
        int(user["id"]),
        video_id,
        expires,
    )

    return {
        "ok": True,
        "stream_url": (
            f"/api/stream/{video_id}"
            f"?token={token}"
        ),
        "expires_at": expires,
    }


@router.get("/stream/{video_id}")
async def stream_track(
    video_id: str,
    request: Request,
    token: str = Query(min_length=20, max_length=256),
):
    """
    Signed, short-lived audio proxy.

    Browser requests are served through this backend rather than using
    the temporary upstream audio URL directly. This reduces failures
    caused by expired CDN links and keeps upstream URLs private.
    """
    if not VIDEO_ID_RE.fullmatch(video_id):
        raise HTTPException(
            status_code=400,
            detail="invalid_video_id",
        )

    user_id = verify_signed_stream_token(
        video_id,
        token,
    )

    if not user_id:
        raise HTTPException(
            status_code=403,
            detail="invalid_or_expired_stream_token",
        )

    range_header = request.headers.get("Range")
    if_range = request.headers.get("If-Range")

    timeout = httpx.Timeout(
        timeout=None,
        connect=15.0,
        read=90.0,
        write=15.0,
        pool=15.0,
    )

    client = httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=True,
    )

    upstream = None

    try:
        for attempt in range(2):
            try:
                stream = await yt.stream(
                    video_id,
                    force_refresh=bool(attempt),
                )

            except asyncio.CancelledError:
                raise

            except Exception as exc:
                logger.warning(
                    "Could not resolve audio source for %s: %s",
                    video_id,
                    type(exc).__name__,
                )
                stream = None

            if not stream or not stream.get("url"):
                continue

            headers = {
                "Accept-Encoding": "identity",
            }

            allowed_headers = {
                "User-Agent",
                "Referer",
                "Accept",
                "Accept-Language",
                "Origin",
                "Cookie",
            }

            upstream_headers = stream.get("headers") or {}

            for name, value in upstream_headers.items():
                if (
                    name in allowed_headers
                    and value
                    and "\r" not in str(value)
                    and "\n" not in str(value)
                ):
                    headers[name] = str(value)

            if range_header:
                headers["Range"] = range_header

            if if_range:
                headers["If-Range"] = if_range

            upstream_request = client.build_request(
                "GET",
                stream["url"],
                headers=headers,
            )

            upstream = await client.send(
                upstream_request,
                stream=True,
            )

            if upstream.status_code in {401, 403, 410}:
                logger.info(
                    "Upstream source expired for %s; refresh attempt %s.",
                    video_id,
                    attempt + 1,
                )

                await upstream.aclose()
                upstream = None
                continue

            if upstream.status_code == 416:
                response_headers = {
                    "Accept-Ranges": "bytes",
                    "Cache-Control": "private, no-store",
                }

                content_range = upstream.headers.get(
                    "Content-Range"
                )

                if content_range:
                    response_headers["Content-Range"] = content_range

                await upstream.aclose()
                await client.aclose()

                return Response(
                    status_code=416,
                    headers=response_headers,
                )

            if upstream.status_code not in {200, 206}:
                logger.warning(
                    "Audio source returned HTTP %s for %s.",
                    upstream.status_code,
                    video_id,
                )

                await upstream.aclose()
                upstream = None
                continue

            response_headers = {
                "Content-Type": upstream.headers.get(
                    "Content-Type",
                    "audio/mpeg",
                ),
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
                "X-Accel-Buffering": "no",
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

            selected_response = upstream

            async def stream_body():
                try:
                    async for chunk in selected_response.aiter_raw(
                        64 * 1024
                    ):
                        yield chunk

                except asyncio.CancelledError:
                    raise

                except Exception:
                    logger.warning(
                        "Audio transfer interrupted for %s.",
                        video_id,
                    )
                    raise

                finally:
                    await selected_response.aclose()
                    await client.aclose()

            return StreamingResponse(
                stream_body(),
                status_code=selected_response.status_code,
                headers=response_headers,
                media_type=None,
            )

        await client.aclose()

        raise HTTPException(
            status_code=502,
            detail="stream_unavailable_after_refresh",
        )

    except HTTPException:
        if upstream is not None:
            await upstream.aclose()

        await client.aclose()
        raise

    except asyncio.CancelledError:
        if upstream is not None:
            await upstream.aclose()

        await client.aclose()
        raise

    except Exception as exc:
        if upstream is not None:
            await upstream.aclose()

        await client.aclose()

        logger.exception(
            "Mini App audio proxy failed for %s.",
            video_id,
        )

        raise HTTPException(
            status_code=502,
            detail="audio_proxy_failed",
        ) from exc


def _validate_and_save_image(
    data: bytes,
    destination: Path,
) -> None:
    """
    Decode and re-encode the uploaded image.

    The original upload is never stored directly. Re-encoding prevents
    disguised executable/polyglot content from being served as an image.
    """
    if not data:
        raise ValueError("image_required")

    if len(data) > settings.max_upload_size:
        raise ValueError("image_too_large")

    try:
        with Image.open(BytesIO(data)) as image:
            if image.format not in {
                "JPEG",
                "PNG",
                "WEBP",
            }:
                raise ValueError("unsupported_image")

            width, height = image.size

            if (
                width <= 0
                or height <= 0
                or width * height > 30_000_000
            ):
                raise ValueError("image_dimensions_invalid")

            image.verify()

        with Image.open(BytesIO(data)) as image:
            image.load()
            image.thumbnail(
                (1600, 1600),
                Image.Resampling.LANCZOS,
            )

            output = image.convert("RGB")

            output.save(
                destination,
                format="WEBP",
                quality=88,
                method=4,
                optimize=True,
            )

    except ValueError:
        raise

    except (
        UnidentifiedImageError,
        OSError,
        Image.DecompressionBombError,
    ) as exc:
        raise ValueError("unsupported_image") from exc


@router.post("/upload/cover")
async def upload_cover(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="image_required",
        )

    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=415,
            detail="unsupported_image",
        )

    user_id = int(user["id"])
    now = asyncio.get_running_loop().time()

    limits = request.app.state.upload_limits
    lock = request.app.state.upload_lock

    async with lock:
        last_upload = limits.get(user_id, 0.0)

        if now - last_upload < settings.upload_cooldown:
            raise HTTPException(
                status_code=429,
                detail="upload_rate_limited",
            )

        limits[user_id] = now

        if len(limits) > 1024:
            oldest = min(
                limits,
                key=limits.get,
            )
            limits.pop(oldest, None)

    data = await file.read(
        settings.max_upload_size + 1
    )

    await file.close()

    if len(data) > settings.max_upload_size:
        raise HTTPException(
            status_code=413,
            detail="image_too_large",
        )

    filename = f"{uuid.uuid4().hex}.webp"
    destination = settings.upload_directory / filename

    try:
        await asyncio.to_thread(
            _validate_and_save_image,
            data,
            destination,
        )

    except ValueError as exc:
        limits.pop(user_id, None)

        raise HTTPException(
            status_code=415,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        limits.pop(user_id, None)

        logger.exception(
            "Image upload failed for user %s.",
            user_id,
        )

        raise HTTPException(
            status_code=500,
            detail="upload_failed",
        ) from exc

    return {
        "ok": True,
        "url": f"/media/covers/{filename}",
        "filename": filename,
        "size": destination.stat().st_size,
        "format": "webp",
    }


@router.post("/recommendations")
async def recommendations(
    payload: AIRecommendationRequest,
    discover: DiscoverService = Depends(get_discover_service),
    user: dict = Depends(get_current_user),
):
    try:
        result = await discover.recommend(
            int(user["id"]),
            payload,
        )

        return {
            "ok": True,
            **result,
        }

    except DiscoverError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=exc.code,
        ) from exc