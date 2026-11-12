
from __future__ import annotations

import asyncio
import os
import re
import secrets
import time
import warnings

from collections import defaultdict
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
)
from PIL import (
    Image,
    ImageOps,
    UnidentifiedImageError,
)

from VampireMusic import db

from VampireMusic.music_server.api.security import (
    get_current_user,
)
from VampireMusic.music_server.api.settings import settings


router = APIRouter(
    prefix="/api/uploads",
    tags=["Uploads"],
)

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}

ALLOWED_IMAGE_FORMATS = {
    "JPEG",
    "PNG",
    "WEBP",
}

MAX_IMAGE_PIXELS = 25_000_000
MAX_OUTPUT_SIZE = 2 * 1024 * 1024

_FILENAME_PATTERN = re.compile(
    r"^[a-f0-9]{32}\.webp$"
)

_upload_times: dict[int, float] = defaultdict(float)
_upload_lock = asyncio.Lock()


def _convert_to_webp(raw: bytes) -> bytes:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter(
                "error",
                Image.DecompressionBombWarning,
            )

            with Image.open(BytesIO(raw)) as image:
                if image.format not in ALLOWED_IMAGE_FORMATS:
                    raise ValueError("unsupported_image_format")

                width, height = image.size

                if (
                    width <= 0
                    or height <= 0
                    or width * height > MAX_IMAGE_PIXELS
                ):
                    raise ValueError("image_dimensions_too_large")

                # Decode only after checking the declared dimensions.
                image.verify()

            with Image.open(BytesIO(raw)) as image:
                image.load()

                image = ImageOps.exif_transpose(image)

                if image.mode in {"RGBA", "LA"}:
                    rgba = image.convert("RGBA")
                    background = Image.new(
                        "RGBA",
                        rgba.size,
                        (255, 255, 255, 255),
                    )
                    background.alpha_composite(rgba)
                    image = background.convert("RGB")
                else:
                    image = image.convert("RGB")

                image.thumbnail(
                    (1600, 1600),
                    Image.Resampling.LANCZOS,
                )

                output = BytesIO()

                image.save(
                    output,
                    format="WEBP",
                    quality=86,
                    method=4,
                    optimize=True,
                )

                result = output.getvalue()

                if not result or len(result) > MAX_OUTPUT_SIZE:
                    raise ValueError("processed_image_too_large")

                return result

    except (
        UnidentifiedImageError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        OSError,
        SyntaxError,
    ) as exc:
        raise ValueError("invalid_or_unsafe_image") from exc


async def _read_limited(
    upload: UploadFile,
    limit: int,
) -> bytes:
    chunks = []
    total = 0

    while True:
        chunk = await upload.read(64 * 1024)

        if not chunk:
            break

        total += len(chunk)

        if total > limit:
            raise HTTPException(
                status_code=413,
                detail="upload_too_large",
            )

        chunks.append(chunk)

    if total == 0:
        raise HTTPException(
            status_code=400,
            detail="empty_upload",
        )

    return b"".join(chunks)


async def _save_atomic(
    destination: Path,
    content: bytes,
) -> None:
    def save():
        destination.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        temporary = destination.with_name(
            f".{destination.name}.{secrets.token_hex(8)}.tmp"
        )

        try:
            with temporary.open("xb") as file:
                file.write(content)
                file.flush()
                os.fsync(file.fileno())

            os.replace(
                temporary,
                destination,
            )

        finally:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass

    await asyncio.to_thread(save)


@router.post("/cover", status_code=201)
async def upload_cover(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    user_id = int(user["id"])

    content_type = (
        (file.content_type or "")
        .split(";", 1)[0]
        .strip()
        .lower()
    )

    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail="unsupported_image_content_type",
        )

    now = time.monotonic()

    async with _upload_lock:
        previous = _upload_times[user_id]
        wait = settings.upload_cooldown - (now - previous)

        if wait > 0:
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "upload_cooldown",
                    "retry_after": max(1, int(wait + 0.999)),
                },
                headers={
                    "Retry-After": str(max(1, int(wait + 0.999))),
                },
            )

        _upload_times[user_id] = now

    raw = await _read_limited(
        file,
        settings.max_upload_size,
    )

    try:
        converted = await asyncio.to_thread(
            _convert_to_webp,
            raw,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=415,
            detail=str(exc),
        ) from exc
    finally:
        await file.close()

    filename = f"{secrets.token_hex(16)}.webp"

    upload_directory = settings.upload_directory.resolve()
    destination = (
        upload_directory / filename
    ).resolve()

    if destination.parent != upload_directory:
        raise HTTPException(
            status_code=500,
            detail="invalid_upload_destination",
        )

    await _save_atomic(
        destination,
        converted,
    )

    try:
        await db.db.music_cover_uploads.insert_one({
            "_id": filename,
            "user_id": user_id,
            "size": len(converted),
            "content_type": "image/webp",
            "created_at": datetime.now(timezone.utc),
        })

    except Exception as exc:
        try:
            await asyncio.to_thread(
                destination.unlink,
                missing_ok=True,
            )
        except OSError:
            pass

        raise HTTPException(
            status_code=503,
            detail="upload_metadata_storage_failed",
        ) from exc

    return {
        "ok": True,
        "filename": filename,
        "cover_url": f"/media/covers/{filename}",
        "size": len(converted),
        "content_type": "image/webp",
    }


@router.delete("/cover/{filename}")
async def delete_cover(
    filename: str,
    user: dict = Depends(get_current_user),
):
    if not _FILENAME_PATTERN.fullmatch(filename):
        raise HTTPException(
            status_code=400,
            detail="invalid_cover_filename",
        )

    user_id = int(user["id"])

    record = await db.db.music_cover_uploads.find_one({
        "_id": filename,
        "user_id": user_id,
    })

    if not record:
        raise HTTPException(
            status_code=404,
            detail="cover_not_found",
        )

    cover_url = f"/media/covers/{filename}"

    playlist_usage = await db.db.music_playlists.count_documents({
        "cover_url": cover_url,
        "deleted_at": {"$exists": False},
    })

    profile_usage = await db.db.music_profiles.count_documents({
        "avatar_url": cover_url,
    })

    if playlist_usage or profile_usage:
        raise HTTPException(
            status_code=409,
            detail="cover_is_currently_in_use",
        )

    upload_directory = settings.upload_directory.resolve()
    destination = (
        upload_directory / filename
    ).resolve()

    if destination.parent != upload_directory:
        raise HTTPException(
            status_code=400,
            detail="invalid_cover_path",
        )

    try:
        await asyncio.to_thread(
            destination.unlink,
            missing_ok=True,
        )
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail="cover_file_delete_failed",
        ) from exc

    await db.db.music_cover_uploads.delete_one({
        "_id": filename,
        "user_id": user_id,
    })

    return {
        "ok": True,
        "deleted": True,
        "filename": filename,
    }
