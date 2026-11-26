
import asyncio
import logging
import os
import re
import shutil
import time
from collections import OrderedDict
from pathlib import Path
from typing import Optional, Union
from urllib.parse import parse_qs, urlparse

import aiohttp
from pyrogram.enums import MessageEntityType
from pyrogram.types import Message

from kimi.extractor.youtube import (
    YouTubeExtractor,
    YouTubeExtractorError,
    YouTubeOptions,
)
from kimi.search.youtube_search import YouTubeSearch, YouTubeSearchError

from VampireMusic.helpers import Track

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
SERVER_DIR = BASE_DIR / "music_server"
DOWNLOAD_DIR = SERVER_DIR / "downloads"
COOKIES_FILE = SERVER_DIR / "cookies.txt"

YOUTUBE_URL = "https://www.youtube.com/watch?v={}"
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

# ----------------------------------------------------------------------
# Stream cache (LRU, bounded)
# ----------------------------------------------------------------------

_STREAM_CACHE: "OrderedDict[str, dict]" = OrderedDict()
_STREAM_CACHE_TTL = 90
_STREAM_CACHE_MAX = 128

_STREAM_LOCKS: "OrderedDict[str, asyncio.Lock]" = OrderedDict()
_STREAM_LOCKS_MAX = 256

_STREAM_RESOLVE_SEMAPHORE = asyncio.Semaphore(2)

# Both audio and video use a muxed format.
_PREFERRED_FORMAT = "muxed"

_CLIENT_FAILURES: "OrderedDict[str, float]" = OrderedDict()
_CLIENT_FAILURE_TTL = 300.0

# Search cache
_SEARCH_CACHE: "OrderedDict[str, tuple[float, list]]" = OrderedDict()
_SEARCH_CACHE_TTL = 120.0
_SEARCH_CACHE_MAX = 64

# ----------------------------------------------------------------------
# Kimi-DLP clients
# ----------------------------------------------------------------------

_EXTRACTOR = None
_SEARCHER = None
_ENGINE_LOCK = asyncio.Lock()

_ANDROID_USER_AGENT = (
    "com.google.android.youtube/20.10.38 "
    "(Linux; U; Android 15) gzip"
)


async def _get_extractor():
    global _EXTRACTOR

    async with _ENGINE_LOCK:
        if _EXTRACTOR is None:
            options = YouTubeOptions(
                retries=0,
                timeout=12.0,
                formats=True,
                metadata=True,
                thumbnails=True,
                description=True,
                chapters=False,
                captions=False,
            )

            _EXTRACTOR = YouTubeExtractor(
                cookies=str(COOKIES_FILE) if _has_cookies() else None,
                timeout=12.0,
                cache_size=128,
                metadata_ttl=120,
                stream_ttl=90,
                request_concurrency=4,
                download_concurrency=2,
                options=options,
            )

        return _EXTRACTOR


async def _get_searcher():
    global _SEARCHER

    async with _ENGINE_LOCK:
        if _SEARCHER is None:
            _SEARCHER = YouTubeSearch(
                timeout=6.0,
                concurrency=4,
                cache_size=64,
                cache_ttl=120,
                retries=0,
                language="en",
                country="IN",
            )

        return _SEARCHER


async def _reset_extractor():
    global _EXTRACTOR

    async with _ENGINE_LOCK:
        old = _EXTRACTOR
        _EXTRACTOR = None

        if old is not None:
            try:
                await old.close()
            except Exception:
                logger.warning("Unable to close old YouTube extractor.")


# ----------------------------------------------------------------------
# Time helpers
# ----------------------------------------------------------------------

def time_to_seconds(value) -> int:
    if not value:
        return 0

    try:
        total = 0
        for part in str(value).split(":"):
            total = total * 60 + int(part)
        return total
    except (TypeError, ValueError):
        return 0


def seconds_to_time(value) -> str:
    value = max(0, int(value or 0))
    hours, remainder = divmod(value, 3600)
    minutes, seconds = divmod(remainder, 60)

    if hours:
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"

    return f"{minutes:02d}:{seconds:02d}"


# ----------------------------------------------------------------------
# Video ID parsing
# ----------------------------------------------------------------------

def extract_video_id(value: str) -> Optional[str]:
    value = (value or "").strip()

    if VIDEO_ID_RE.fullmatch(value):
        return value

    try:
        parsed = urlparse(value)
        host = (parsed.hostname or "").lower()

        if host == "youtu.be":
            video_id = parsed.path.strip("/").split("/")[0]

        elif host in {
            "youtube.com",
            "www.youtube.com",
            "m.youtube.com",
            "music.youtube.com",
            "youtube-nocookie.com",
            "www.youtube-nocookie.com",
        }:
            video_id = parse_qs(parsed.query).get("v", [""])[0]

            if not video_id:
                parts = [
                    part for part in parsed.path.split("/")
                    if part
                ]

                if len(parts) > 1 and parts[0] in {
                    "shorts",
                    "live",
                    "embed",
                    "v",
                }:
                    video_id = parts[1]
        else:
            return None

        return (
            video_id
            if isinstance(video_id, str)
            and VIDEO_ID_RE.fullmatch(video_id)
            else None
        )

    except (TypeError, ValueError):
        return None


def normalize_url(value: str) -> str:
    video_id = extract_video_id(value)

    return (
        YOUTUBE_URL.format(video_id)
        if video_id
        else (value or "").strip()
    )


def _prepare_link(link, videoid=None):
    link = str(link or "").strip()

    if videoid:
        return YOUTUBE_URL.format(link)

    if extract_video_id(link):
        return normalize_url(link)

    return link


# ----------------------------------------------------------------------
# Cookie helpers
# ----------------------------------------------------------------------

def _has_cookies() -> bool:
    try:
        return (
            COOKIES_FILE.is_file()
            and COOKIES_FILE.stat().st_size > 0
        )
    except OSError:
        return False


# ----------------------------------------------------------------------
# Kimi-DLP extraction
# ----------------------------------------------------------------------

async def _extract_info(
    query: str,
    download: bool = False,
    video: bool = False,
    force: bool = False,
):
    extractor = await _get_extractor()

    return await extractor.extract(
        normalize_url(query),
        force=force,
    )


def _select_muxed_format(info: dict, format_id=None):
    """
    Only select formats containing both audio and video.
    Never select separate audio-only/video-only formats.
    """

    formats = info.get("formats") or []

    muxed = [
        item
        for item in formats
        if isinstance(item, dict)
        and item.get("has_audio")
        and item.get("has_video")
        and item.get("url")
        and item.get("is_direct", True)
    ]

    if not muxed:
        return None

    if format_id is not None:
        requested = str(format_id)

        selected = next(
            (
                item for item in muxed
                if str(item.get("itag")) == requested
            ),
            None,
        )

        if selected:
            return selected

    # Prefer higher resolution and bitrate.
    # MP4 wins when the other properties are equal.
    return max(
        muxed,
        key=lambda item: (
            int(item.get("height") or 0),
            int(item.get("bitrate") or 0),
            int(item.get("audio_bitrate") or 0),
            item.get("extension") == "mp4",
        ),
    )


# ----------------------------------------------------------------------
# Stream cache helpers
# ----------------------------------------------------------------------

def _get_stream_lock(video_id: str) -> asyncio.Lock:
    lock = _STREAM_LOCKS.get(video_id)

    if lock is None:
        lock = asyncio.Lock()
        _STREAM_LOCKS[video_id] = lock
        _STREAM_LOCKS.move_to_end(video_id)

    while len(_STREAM_LOCKS) > _STREAM_LOCKS_MAX:
        key, candidate = next(iter(_STREAM_LOCKS.items()))

        if key == video_id or candidate.locked():
            _STREAM_LOCKS.move_to_end(key)

            if next(iter(_STREAM_LOCKS)) == video_id:
                break

            continue

        _STREAM_LOCKS.pop(key)

    return lock


def invalidate_stream_cache(video_id: str) -> None:
    video_id = extract_video_id(video_id)

    if video_id:
        _STREAM_CACHE.pop(video_id, None)

        for key in list(_CLIENT_FAILURES.keys()):
            if key.startswith(f"{video_id}:"):
                _CLIENT_FAILURES.pop(key, None)


def invalidate_stream_cache_for_all():
    _STREAM_CACHE.clear()
    _SEARCH_CACHE.clear()
    _CLIENT_FAILURES.clear()

    if _SEARCHER is not None:
        _SEARCHER.clear_cache()


def _cache_stream(data: dict):
    if not data:
        return

    video_id = data.get("id")
    stream_url = data.get("url")

    if not video_id or not stream_url:
        return

    now = time.monotonic()

    _STREAM_CACHE[str(video_id)] = {
        "url": stream_url,
        "headers": data.get("headers") or {},
        "ext": data.get("ext") or "mp4",
        "created_at": now,
        "expires": now + _STREAM_CACHE_TTL,
    }

    _STREAM_CACHE.move_to_end(str(video_id))

    for key in list(_STREAM_CACHE.keys()):
        if _STREAM_CACHE[key]["expires"] <= now:
            _STREAM_CACHE.pop(key, None)

    while len(_STREAM_CACHE) > _STREAM_CACHE_MAX:
        _STREAM_CACHE.popitem(last=False)


# ----------------------------------------------------------------------
# Search using Kimi-DLP YouTubeSearch
# ----------------------------------------------------------------------

async def _ydl_search(query: str, limit: int = 10) -> list[dict]:
    """
    Keep the existing search result structure.
    Kimi-DLP returns YouTube search results which are normalized
    into the structure expected by the existing Track builder.
    """

    try:
        searcher = await _get_searcher()

        response = await searcher.search(
            query,
            filter="videos",
            limit=max(1, min(int(limit), 100)),
        )

        entries = response.get("results") or []
        results = []

        for entry in entries:
            if not isinstance(entry, dict):
                continue

            video_id = str(entry.get("id") or "").strip()

            if not VIDEO_ID_RE.fullmatch(video_id):
                continue

            title = str(entry.get("title") or "").strip()

            if not title:
                continue

            duration = entry.get("duration_seconds")

            if duration is None:
                duration = time_to_seconds(entry.get("duration"))

            try:
                duration_sec = int(duration or 0)
            except (TypeError, ValueError):
                duration_sec = 0

            if duration_sec <= 0:
                continue

            channel = (
                entry.get("channel_name")
                or entry.get("channel")
                or entry.get("owner")
                or ""
            )

            if isinstance(channel, dict):
                channel = channel.get("name", "")

            results.append({
                "id": video_id,
                "title": title,
                "duration": duration_sec,
                "uploader": str(channel),
                "webpage_url": (
                    entry.get("url")
                    or YOUTUBE_URL.format(video_id)
                ),
                "thumbnail": entry.get("thumbnail"),
                "view_count": str(
                    entry.get("views")
                    or entry.get("view_count")
                    or ""
                ),
            })

        return results

    except asyncio.CancelledError:
        raise

    except (YouTubeSearchError, Exception) as exc:
        logger.warning(
            "Kimi-DLP search failed for '%s': %s",
            query,
            type(exc).__name__,
        )
        return []


async def _search_with_cache(query: str, limit: int) -> list[dict]:
    key = f"{query.lower().strip()}::{limit}"
    now = time.monotonic()

    cached = _SEARCH_CACHE.get(key)

    if cached:
        created_at, results = cached

        if now - created_at < _SEARCH_CACHE_TTL:
            _SEARCH_CACHE.move_to_end(key)
            return results

        _SEARCH_CACHE.pop(key, None)

    results = await _ydl_search(query, limit)

    if results:
        _SEARCH_CACHE[key] = (time.monotonic(), results)
        _SEARCH_CACHE.move_to_end(key)

        while len(_SEARCH_CACHE) > _SEARCH_CACHE_MAX:
            _SEARCH_CACHE.popitem(last=False)

    return results


# ----------------------------------------------------------------------
# Stream resolution
# ----------------------------------------------------------------------

async def _resolve_audio_stream(video_id: str) -> dict:
    """
    Resolve a muxed format containing BOTH audio and video.

    The existing playback pipeline uses -vn for audio playback.
    That removes the video track while retaining the audio track.
    """

    info = await _extract_info(
        YOUTUBE_URL.format(video_id),
        force=True,
    )

    if not info:
        raise YouTubeExtractorError("Empty YouTube extraction result.")

    selected = _select_muxed_format(info)

    if not selected:
        raise YouTubeExtractorError(
            "No direct muxed audio/video format is available."
        )

    url = selected.get("url")

    if not url:
        raise YouTubeExtractorError("Muxed format URL is missing.")

    return {
        "url": url,
        "headers": {
            "User-Agent": _ANDROID_USER_AGENT,
            "Accept": "*/*",
            "Accept-Encoding": "identity",
        },
        "ext": selected.get("extension") or "mp4",
        "itag": selected.get("itag"),
        "format": selected,
    }


# ----------------------------------------------------------------------
# Track builder
# ----------------------------------------------------------------------

def _make_track(
    data: dict,
    message_id: int = 0,
    video: bool = False,
) -> Optional[Track]:

    if not data:
        return None

    video_id = data.get("id")

    if not video_id:
        return None

    duration = data.get("duration")

    try:
        duration_sec = int(float(duration or 0))
    except (TypeError, ValueError):
        duration_sec = 0

    title = data.get("title") or "Unknown title"

    webpage_url = (
        data.get("webpage_url")
        or data.get("url")
        or YOUTUBE_URL.format(video_id)
    )

    thumbnail = data.get("thumbnail")

    if not thumbnail:
        thumbnails = data.get("thumbnails") or []

        if thumbnails:
            thumbnail = thumbnails[-1].get("url")

    channel = (
        data.get("uploader")
        or data.get("channel_name")
        or data.get("channel")
    )

    return Track(
        id=str(video_id),
        title=str(title),
        channel_name=channel,
        duration=seconds_to_time(duration_sec),
        duration_sec=duration_sec,
        url=webpage_url,
        thumbnail=thumbnail,
        message_id=message_id,
        video=video,
        view_count=str(
            data.get("view_count")
            or data.get("views")
            or ""
        ),
    )


async def _fast_search_tracks(
    query: str,
    message_id: int = 0,
    video: bool = False,
    limit: int = 10,
) -> list[Track]:

    limit = max(1, min(int(limit), 20))
    raw = await _search_with_cache(query, limit)

    tracks = []

    for entry in raw:
        track = _make_track(entry, message_id, video)

        if track:
            tracks.append(track)

    return tracks


# ----------------------------------------------------------------------
# Public API class
# ----------------------------------------------------------------------

class YouTubeAPI:

    def __init__(self):
        self.base = "https://www.youtube.com/watch?v="
        self.regex = r"(?:youtube\.com|youtu\.be)"
        self.status = "https://www.youtube.com/oembed?url="
        self.listbase = "https://youtube.com/playlist?list="

    async def stream(
        self,
        video_id: str,
        force_refresh: bool = False,
    ):

        video_id = extract_video_id(video_id)

        if not video_id:
            return None

        request_started = time.monotonic()

        if force_refresh:
            invalidate_stream_cache(video_id)

        lock = _get_stream_lock(video_id)

        async with lock:
            now = time.monotonic()
            cached = _STREAM_CACHE.get(video_id)

            if cached and cached["expires"] > now:
                if (
                    not force_refresh
                    or cached.get("created_at", 0) >= request_started
                ):
                    _STREAM_CACHE.move_to_end(video_id)

                    return {
                        "url": cached["url"],
                        "headers": cached["headers"],
                        "ext": cached.get("ext") or "mp4",
                    }

            if cached:
                _STREAM_CACHE.pop(video_id, None)

            try:
                async with _STREAM_RESOLVE_SEMAPHORE:
                    data = await _resolve_audio_stream(video_id)

                if not data or not data.get("url"):
                    return None

                _cache_stream({
                    "id": video_id,
                    "url": data["url"],
                    "headers": data.get("headers") or {},
                    "ext": data.get("ext") or "mp4",
                })

                return {
                    "url": data["url"],
                    "headers": data.get("headers") or {},
                    "ext": data.get("ext") or "mp4",
                }

            except asyncio.CancelledError:
                raise

            except Exception as exc:
                logger.warning(
                    "Muxed stream resolution failed for %s: %s",
                    video_id,
                    type(exc).__name__,
                )
                return None

    async def save_cookies(self, source: str) -> bool:

        if not source:
            return False

        SERVER_DIR.mkdir(parents=True, exist_ok=True)
        source = str(source).strip()

        try:
            if source.startswith("https://"):
                timeout = aiohttp.ClientTimeout(
                    total=30,
                    connect=10,
                )

                async with aiohttp.ClientSession(
                    timeout=timeout
                ) as session:

                    async with session.get(
                        source,
                        allow_redirects=False,
                    ) as response:

                        if response.status != 200:
                            logger.error(
                                "Cookie download failed: HTTP %s",
                                response.status,
                            )
                            return False

                        content = await response.read()

                if not content or len(content) > 2 * 1024 * 1024:
                    logger.error("Cookie file is empty or too large.")
                    return False

                text = content.decode("utf-8", errors="strict")

                if "Netscape HTTP Cookie File" not in text[:500]:
                    logger.error("Invalid Netscape cookie file.")
                    return False

                temp_file = COOKIES_FILE.with_suffix(".tmp")
                temp_file.write_text(text, encoding="utf-8")
                os.chmod(temp_file, 0o600)
                temp_file.replace(COOKIES_FILE)

            else:
                local_file = Path(source).expanduser()

                if not local_file.is_file():
                    logger.error("Cookie file does not exist.")
                    return False

                shutil.copyfile(local_file, COOKIES_FILE)
                os.chmod(COOKIES_FILE, 0o600)

            invalidate_stream_cache_for_all()
            await _reset_extractor()

            logger.info("YouTube cookies loaded.")
            return True

        except Exception as exc:
            logger.error(
                "Unable to load cookies: %s",
                type(exc).__name__,
            )
            return False

    async def exists(
        self,
        link: str,
        videoid: Union[bool, str] = None,
    ):
        if videoid:
            link = self.base + str(link)

        return bool(re.search(self.regex, link or "", re.I))

    async def url(self, message_1: Message) -> Optional[str]:

        messages = [message_1]

        if message_1.reply_to_message:
            messages.append(message_1.reply_to_message)

        for message in messages:
            text = message.text or message.caption or ""
            entities = message.entities or message.caption_entities or []

            for entity in entities:
                if entity.type == MessageEntityType.TEXT_LINK:
                    return entity.url

                if entity.type == MessageEntityType.URL:
                    return text[
                        entity.offset:entity.offset + entity.length
                    ]

        return None

    async def search(
        self,
        query: str,
        m_id: int = 0,
        video: bool = False,
    ):

        query = str(query or "").strip()

        if not query:
            return None

        if not extract_video_id(query):
            try:
                tracks = await _fast_search_tracks(
                    query=query,
                    message_id=m_id,
                    video=video,
                    limit=1,
                )

                return tracks[0] if tracks else None

            except Exception as exc:
                logger.warning(
                    "Search failed: %s",
                    type(exc).__name__,
                )
                return None

        try:
            info = await _extract_info(normalize_url(query))

            return _make_track(info, m_id, video)

        except Exception as exc:
            logger.warning(
                "URL extraction failed: %s",
                type(exc).__name__,
            )
            return None

    async def search_multi(
        self,
        query: str,
        m_id: int = 0,
        video: bool = False,
        limit: int = 10,
    ) -> list[Track]:

        query = str(query or "").strip()

        if not query:
            return []

        if extract_video_id(query):
            track = await self.search(query, m_id, video)
            return [track] if track else []

        try:
            return await _fast_search_tracks(
                query=query,
                message_id=m_id,
                video=video,
                limit=limit,
            )

        except Exception:
            logger.exception("Multi-search failed: %s", query)
            return []

    async def playlist(
        self,
        link: str,
        limit: int,
        user_id: str = None,
        videoid: Union[bool, str] = None,
        *,
        video: bool = False,
    ) -> list[Track]:

        link = str(link or "").strip()

        if not link:
            return []

        if videoid and not re.search(
            r"(?:youtube(?:-nocookie)?\.com|youtu\.be)",
            link,
            re.I,
        ):
            link = self.listbase + link

        try:
            limit = max(1, min(int(limit), 100))

            extractor = await _get_extractor()

            info = await extractor.get_playlist(
                link,
                limit=limit,
                flat=True,
                options=YouTubeOptions(
                    retries=0,
                    timeout=12.0,
                    formats=False,
                    metadata=True,
                    thumbnails=True,
                    chapters=False,
                    captions=False,
                ),
            )

            entries = (info or {}).get("items") or []
            tracks = []

            for entry in entries[:limit]:
                if not entry or entry.get("is_playable") is False:
                    continue

                normalized = {
                    "id": entry.get("id"),
                    "title": entry.get("title"),
                    "duration": entry.get("duration") or 0,
                    "uploader": entry.get("short_byline") or "",
                    "webpage_url": (
                        entry.get("url")
                        or YOUTUBE_URL.format(entry.get("id"))
                    ),
                    "thumbnail": entry.get("thumbnail"),
                }

                if (
                    not normalized["title"]
                    or not normalized["duration"]
                ):
                    try:
                        detail = await _extract_info(
                            normalized["webpage_url"]
                        )

                        if detail:
                            normalized.update({
                                "title": detail.get("title")
                                or normalized["title"],
                                "duration": detail.get("duration")
                                or normalized["duration"],
                                "uploader": detail.get("channel")
                                or normalized["uploader"],
                                "thumbnail": detail.get("thumbnail")
                                or normalized["thumbnail"],
                            })

                    except Exception:
                        continue

                track = _make_track(normalized, video=video)

                if track:
                    tracks.append(track)

            return tracks

        except Exception as exc:
            logger.warning(
                "Playlist failed: %s",
                type(exc).__name__,
            )
            return []

    async def details(
        self,
        link: str,
        videoid: Union[bool, str] = None,
    ):

        link = _prepare_link(link, videoid)

        info = await _extract_info(normalize_url(link))

        if not info:
            raise RuntimeError("Unable to fetch details.")

        duration_sec = int(info.get("duration") or 0)
        title = info.get("title") or "Unknown title"
        views = info.get("view_count") or 0
        thumbnail = info.get("thumbnail")

        if not thumbnail:
            thumbnails = info.get("thumbnails") or []

            if thumbnails:
                thumbnail = thumbnails[-1].get("url")

        return (
            title,
            seconds_to_time(duration_sec),
            views,
            thumbnail,
        )

    async def title(
        self,
        link: str,
        videoid: Union[bool, str] = None,
    ):
        return (await self.details(link, videoid))[0]

    async def duration(
        self,
        link: str,
        videoid: Union[bool, str] = None,
    ):
        return (await self.details(link, videoid))[1]

    async def thumbnail(
        self,
        link: str,
        videoid: Union[bool, str] = None,
    ):
        return (await self.details(link, videoid))[3]

    async def track(
        self,
        link: str,
        videoid: Union[bool, str] = None,
    ):

        link = _prepare_link(link, videoid)

        info = await _extract_info(normalize_url(link))
        track = _make_track(info)

        if not track:
            return None, None

        return {
            "title": track.title,
            "link": track.url,
            "vidid": track.id,
            "duration_min": track.duration,
            "thumb": track.thumbnail,
        }, track.id

    async def download(
        self,
        link: str,
        mystic=None,
        video: Union[bool, str] = None,
        videoid: Union[bool, str] = None,
        songaudio=None,
        songvideo=None,
        format_id=None,
        title=None,
    ) -> Optional[str]:

        link = _prepare_link(link, videoid)

        try:
            video_id = extract_video_id(link)

            if not video_id:
                return None

            info = await _extract_info(
                normalize_url(link),
                force=True,
            )

            if not info:
                return None

            selected = _select_muxed_format(
                info,
                format_id=format_id,
            )

            if not selected:
                logger.warning(
                    "No muxed format available for %s",
                    video_id,
                )
                return None

            DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

            extension = selected.get("extension") or "mp4"
            output = DOWNLOAD_DIR / f"{video_id}.{extension}"

            extractor = await _get_extractor()

            result = await extractor.download_format(
                video_id,
                int(selected["itag"]),
                output,
                options=YouTubeOptions(
                    retries=0,
                    timeout=12.0,
                    formats=True,
                ),
                chunk_size=1024 * 1024,
                resume=True,
                max_url_refreshes=2,
            )

            filepath = result.get("path")

            if filepath and Path(filepath).is_file():
                return str(Path(filepath))

            return None

        except asyncio.CancelledError:
            raise

        except Exception as exc:
            logger.warning(
                "Download failed: %s",
                type(exc).__name__,
            )
            return None

    async def detect_platform(self, link: str):
        if extract_video_id(link):
            return "youtube", link

        return None

    async def resolve_video(
        self,
        link: str,
        message_id: int = 0,
        platform=None,
    ):

        track = await self.search(
            link,
            message_id,
            video=True,
        )

        if not track:
            return None

        track.file_path = await self.download(
            track.url,
            video=True,
        )

        return track if track.file_path else None

    async def video(
        self,
        link: str,
        videoid: Union[bool, str] = None,
    ):

        link = _prepare_link(link, videoid)
        filepath = await self.download(link, video=True)

        return (
            (1, filepath)
            if filepath
            else (0, "Video download failed")
        )

    async def formats(
        self,
        link: str,
        videoid: Union[bool, str] = None,
    ):

        link = _prepare_link(link, videoid)
        normalized_url = normalize_url(link)

        info = await _extract_info(normalized_url)
        formats = []

        for item in (info or {}).get("formats", []):
            if item.get("itag") is None:
                continue

            formats.append({
                "format": item.get("quality"),
                "filesize": item.get("content_length"),
                "format_id": str(item.get("itag")),
                "ext": item.get("extension"),
                "format_note": item.get("codecs"),
                "yturl": normalized_url,
                "has_audio": item.get("has_audio"),
                "has_video": item.get("has_video"),
                "format_type": item.get("format_type"),
                "height": item.get("height"),
                "width": item.get("width"),
            })

        return formats, normalized_url

    async def slider(
        self,
        link: str,
        query_type: int,
        videoid: Union[bool, str] = None,
    ):

        link = _prepare_link(link, videoid)

        tracks = await self.search_multi(
            link,
            limit=10,
        )

        if not 0 <= query_type < len(tracks):
            return None, None, None, None

        track = tracks[query_type]

        return (
            track.title,
            track.duration,
            track.thumbnail,
            track.id,
        )


YouTube = YouTubeAPI
