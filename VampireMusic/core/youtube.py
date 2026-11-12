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
import yt_dlp
from pyrogram.enums import MessageEntityType
from pyrogram.types import Message

from py_yt import VideosSearch

from VampireMusic.helpers import Track

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
SERVER_DIR = BASE_DIR / "music_server"
DOWNLOAD_DIR = SERVER_DIR / "downloads"
COOKIES_FILE = SERVER_DIR / "cookies.txt"

YOUTUBE_URL = "https://www.youtube.com/watch?v={}"
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

# ----------------------------------------------------------------------
# Stream cache: bounded LRU with TTL. URLs expire fast (~6h) but we keep
# a short local TTL so failures are picked up quickly.
# ----------------------------------------------------------------------
_STREAM_CACHE: "OrderedDict[str, dict]" = OrderedDict()
_STREAM_CACHE_TTL = 60            # seconds (URLs expire; keep short)
_STREAM_CACHE_MAX = 128           # hard cap -> memory bounded

_STREAM_LOCKS: "OrderedDict[str, asyncio.Lock]" = OrderedDict()
_STREAM_LOCKS_MAX = 256

# Limit concurrent yt-dlp calls so RAM/CPU stays predictable under load.
_STREAM_RESOLVE_SEMAPHORE = asyncio.Semaphore(3)

# Preferred audio format (Opus in WebM is small + streams well).
_PREFERRED_FORMAT = (
    "bestaudio[acodec=opus][ext=webm]/"
    "bestaudio[acodec=opus]/"
    "bestaudio[ext=webm]/"
    "bestaudio/best"
)

# Preferred client order for fallback resolution.
_DEFAULT_CLIENTS = ("web", "android", "ios", "tv_embedded")


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


def extract_video_id(value: str) -> Optional[str]:
    value = (value or "").strip()
    if VIDEO_ID_RE.fullmatch(value):
        return value

    try:
        parsed = urlparse(value)
        host = parsed.netloc.lower().split(":")[0]

        if host.endswith("youtu.be"):
            video_id = parsed.path.strip("/").split("/")[0]
        elif host.endswith(("youtube.com", "youtube-nocookie.com")):
            if parsed.path == "/watch":
                video_id = parse_qs(parsed.query).get("v", [""])[0]
            else:
                parts = parsed.path.strip("/").split("/")
                video_id = parts[1] if len(parts) > 1 else ""
        else:
            return None

        return video_id if VIDEO_ID_RE.fullmatch(video_id) else None
    except (TypeError, ValueError):
        return None


def normalize_url(value: str) -> str:
    video_id = extract_video_id(value)
    return YOUTUBE_URL.format(video_id) if video_id else (value or "").strip()


def _has_cookies() -> bool:
    try:
        return COOKIES_FILE.is_file() and COOKIES_FILE.stat().st_size > 0
    except OSError:
        return False


def _ydl_options(download: bool = False, video: bool = False) -> dict:
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

    options = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "ignoreerrors": True,
        "extract_flat": False,
        "socket_timeout": 15,
        "retries": 2,
        "fragment_retries": 2,
        "overwrites": False,
        # Reduce memory while streaming info extraction.
        "extractor_args": {
            "youtube": {
                "player_skip": ["configs"],
            },
        },
    }

    if _has_cookies():
        options["cookiefile"] = str(COOKIES_FILE)

    if download:
        options.update({
            "format": "bestvideo[acodec=opus]+bestaudio[acodec=opus]/bestvideo+bestaudio/best"
                      if video else _PREFERRED_FORMAT,
            "outtmpl": str(DOWNLOAD_DIR / "%(id)s.%(ext)s"),
            "restrictfilenames": True,
            "windowsfilenames": True,
            "continuedl": True,
        })

    return options


def _extract_info(query: str, download: bool = False, video: bool = False):
    options = _ydl_options(download=download, video=video)
    with yt_dlp.YoutubeDL(options) as ydl:
        return ydl.extract_info(query, download=download)


def _get_stream_lock(video_id: str) -> asyncio.Lock:
    lock = _STREAM_LOCKS.get(video_id)

    if lock is None:
        lock = asyncio.Lock()
        _STREAM_LOCKS[video_id] = lock
        _STREAM_LOCKS.move_to_end(video_id)

    # LRU eviction: only evict unlocked locks, never the one we return.
    while len(_STREAM_LOCKS) > _STREAM_LOCKS_MAX:
        key, candidate = next(iter(_STREAM_LOCKS.items()))
        if key == video_id or candidate.locked():
            # move to end and try next
            _STREAM_LOCKS.move_to_end(key)
            # if we reached the target again, break to avoid infinite loop
            if next(iter(_STREAM_LOCKS)) == video_id:
                break
            continue
        _STREAM_LOCKS.pop(key)

    return lock


def invalidate_stream_cache(video_id: str) -> None:
    video_id = extract_video_id(video_id)
    if video_id:
        _STREAM_CACHE.pop(video_id, None)


def invalidate_stream_cache_for_all():
    _STREAM_CACHE.clear()


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
        "headers": data.get("http_headers") or data.get("headers") or {},
        "ext": data.get("ext") or "webm",
        "created_at": now,
        "expires": now + _STREAM_CACHE_TTL,
    }
    _STREAM_CACHE.move_to_end(str(video_id))

    # Purge expired
    for key in list(_STREAM_CACHE.keys()):
        if _STREAM_CACHE[key]["expires"] <= now:
            _STREAM_CACHE.pop(key, None)

    # LRU eviction
    while len(_STREAM_CACHE) > _STREAM_CACHE_MAX:
        _STREAM_CACHE.popitem(last=False)


def _configured_clients() -> list[str]:
    raw = os.getenv("YTDLP_PLAYER_CLIENT", "").strip()
    if raw:
        clients = [item.strip() for item in raw.split(",") if item.strip()]
        if clients:
            return clients
    return list(_DEFAULT_CLIENTS)


def _resolve_audio_stream(
    video_id: str,
    client_override: Optional[str] = None,
) -> dict:
    """
    Resolve audio URL. Always tries explicit clients in order,
    even when cookies are present, because yt-dlp's auto-selection
    often picks 'web' which fails on flagged VPS IPs.
    """
    source = YOUTUBE_URL.format(video_id)
    has_cookies = _has_cookies()

    # Priority order: tv/mweb first (best cookie + anti-bot support),
    # then web, then fallback clients.
    if client_override:
        clients_to_try = [client_override]
    elif has_cookies:
        # WITH cookies: use tv and mweb first (they honor cookies)
        clients_to_try = ["tv", "mweb", "web", "android"]
    else:
        # WITHOUT cookies: tv and mweb still best for VPS IPs
        clients_to_try = ["tv", "mweb", "web"]

    last_error: Optional[Exception] = None

    for client in clients_to_try:
        options = _ydl_options()
        options.update({
            "ignoreerrors": False,
            "format": _PREFERRED_FORMAT,
        })

        if client:
            options["extractor_args"] = {
                "youtube": {
                    "player_client": [client],
                    "player_skip": ["configs"],
                },
            }

        try:
            with yt_dlp.YoutubeDL(options) as ydl:
                info = ydl.extract_info(source, download=False)

            if not info:
                last_error = RuntimeError("empty_info")
                continue

            if info.get("_type") == "playlist":
                entries = [e for e in (info.get("entries") or []) if e]
                if not entries:
                    last_error = RuntimeError("empty_playlist")
                    continue
                info = entries[0]

            url = info.get("url")
            if not url:
                last_error = RuntimeError("no_url")
                continue

            return {
                "url": url,
                "headers": info.get("http_headers") or {},
                "ext": info.get("ext") or "webm",
                "client": client,
            }

        except Exception as exc:
            last_error = exc
            logger.debug(
                "Resolve failed (client=%s, id=%s): %s",
                client, video_id, type(exc).__name__,
            )
            continue

    raise RuntimeError(
        f"Audio resolution failed for {video_id}: "
        f"{type(last_error).__name__ if last_error else 'unknown'}"
    )

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

    duration_sec = int(data.get("duration") or 0)
    title = data.get("title") or "Unknown title"
    webpage_url = data.get("webpage_url") or YOUTUBE_URL.format(video_id)

    thumbnail = data.get("thumbnail")
    if not thumbnail:
        thumbnails = data.get("thumbnails") or []
        if thumbnails:
            thumbnail = thumbnails[-1].get("url")

    return Track(
        id=str(video_id),
        title=str(title),
        channel_name=data.get("uploader") or data.get("channel"),
        duration=seconds_to_time(duration_sec),
        duration_sec=duration_sec,
        url=webpage_url,
        thumbnail=thumbnail,
        message_id=message_id,
        video=video,
        view_count=str(data.get("view_count") or ""),
    )


async def _fast_search_tracks(
    query: str,
    message_id: int = 0,
    video: bool = False,
    limit: int = 10,
) -> list[Track]:
    limit = max(1, min(int(limit), 20))

    search = VideosSearch(
        query,
        limit=limit,
        language="en",
        region="IN",
        timeout=3.5,
        with_live=False,
        max_retries=0,
    )

    try:
        response = await asyncio.wait_for(search.next(), timeout=4.5)
    finally:
        client = getattr(search, "async_client", None)
        close = getattr(client, "aclose", None)
        if close is not None:
            try:
                await close()
            except Exception:
                pass

    entries = response.get("result", []) if isinstance(response, dict) else []
    tracks = []

    for entry in entries:
        if not isinstance(entry, dict):
            continue

        video_id = str(entry.get("id") or "").strip()
        title = str(entry.get("title") or "").strip()
        duration_sec = time_to_seconds(entry.get("duration"))

        if not VIDEO_ID_RE.fullmatch(video_id):
            continue
        if not title or duration_sec <= 0:
            continue

        thumbnails = entry.get("thumbnails") or []
        thumbnail = None
        if isinstance(thumbnails, list):
            thumbnail = next(
                (
                    item.get("url")
                    for item in reversed(thumbnails)
                    if isinstance(item, dict) and item.get("url")
                ),
                None,
            )
        elif isinstance(thumbnails, dict):
            thumbnail = thumbnails.get("url")

        channel = entry.get("channel") or {}
        channel_name = channel.get("name") if isinstance(channel, dict) else str(channel)

        view_data = entry.get("viewCount") or {}
        if isinstance(view_data, dict):
            view_count = view_data.get("text") or view_data.get("short") or ""
        else:
            view_count = str(view_data)

        track = _make_track(
            {
                "id": video_id,
                "title": title,
                "duration": duration_sec,
                "uploader": channel_name,
                "webpage_url": entry.get("link") or YOUTUBE_URL.format(video_id),
                "thumbnail": thumbnail,
                "view_count": view_count,
            },
            message_id,
            video,
        )
        if track:
            tracks.append(track)

    return tracks


class YouTubeAPI:
    def __init__(self):
        self.base = "https://www.youtube.com/watch?v="
        self.regex = r"(?:youtube\.com|youtu\.be)"
        self.status = "https://www.youtube.com/oembed?url="
        self.listbase = "https://youtube.com/playlist?list="

    async def stream(self, video_id: str, force_refresh: bool = False):
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
                if not force_refresh or cached.get("created_at", 0) >= request_started:
                    _STREAM_CACHE.move_to_end(video_id)
                    return {
                        "url": cached["url"],
                        "headers": cached["headers"],
                        "ext": cached.get("ext") or "webm",
                    }

            if cached:
                _STREAM_CACHE.pop(video_id, None)

            try:
                async with _STREAM_RESOLVE_SEMAPHORE:
                    data = await asyncio.to_thread(_resolve_audio_stream, video_id)

                if not data or not data.get("url"):
                    return None

                _cache_stream({
                    "id": video_id,
                    "url": data["url"],
                    "headers": data.get("headers") or {},
                    "ext": data.get("ext") or "webm",
                })

                return {
                    "url": data["url"],
                    "headers": data.get("headers") or {},
                    "ext": data.get("ext") or "webm",
                }

            except asyncio.CancelledError:
                raise

            except Exception as exc:
                logger.warning(
                    "Audio stream resolution failed for %s: %s",
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
                timeout = aiohttp.ClientTimeout(total=30, connect=10)
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    async with session.get(source, allow_redirects=False) as response:
                        if response.status != 200:
                            logger.error("Cookie download failed: HTTP %s", response.status)
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
            logger.info("YouTube cookies loaded.")
            return True

        except Exception as exc:
            logger.error("Unable to load YouTube cookies: %s", type(exc).__name__)
            return False

    async def exists(self, link: str, videoid: Union[bool, str] = None):
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
                    return text[entity.offset:entity.offset + entity.length]

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
                logger.warning("Fast YouTube search failed: %s", type(exc).__name__)
                return None

        try:
            info = await asyncio.to_thread(_extract_info, normalize_url(query))

            if info and "entries" in info:
                info = next((e for e in (info.get("entries") or []) if e), None)

            return _make_track(info, m_id, video)

        except Exception as exc:
            logger.warning("YouTube URL extraction failed: %s", type(exc).__name__)
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
            logger.exception("Fast YouTube multi-search failed for query: %s", query)
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
            r"(?:youtube(?:-nocookie)?\.com|youtu\.be)", link, re.I
        ):
            link = self.listbase + link

        try:
            limit = max(1, min(int(limit), 100))
            options = _ydl_options()
            options.update({
                "noplaylist": False,
                "extract_flat": "in_playlist",
                "playlistend": limit,
            })

            def extract_playlist():
                with yt_dlp.YoutubeDL(options) as ydl:
                    return ydl.extract_info(link, download=False)

            info = await asyncio.to_thread(extract_playlist)
            tracks = []

            for entry in ((info or {}).get("entries") or [])[:limit]:
                if not entry:
                    continue

                video_url = entry.get("url") or entry.get("id")
                if not video_url:
                    continue

                if not entry.get("title") or not entry.get("duration"):
                    try:
                        detail = await asyncio.to_thread(
                            _extract_info, normalize_url(str(video_url))
                        )
                        entry = detail or entry
                    except Exception:
                        continue

                track = _make_track(entry, video=video)
                if track:
                    tracks.append(track)

            return tracks

        except Exception as exc:
            logger.warning("YouTube playlist failed: %s", type(exc).__name__)
            return []

    async def details(self, link: str, videoid: Union[bool, str] = None):
        if videoid:
            link = self.base + str(link)

        info = await asyncio.to_thread(_extract_info, normalize_url(link))
        if not info:
            raise RuntimeError("Unable to fetch YouTube video details.")

        duration_sec = int(info.get("duration") or 0)
        title = info.get("title") or "Unknown title"
        views = info.get("view_count") or 0

        thumbnail = info.get("thumbnail")
        if not thumbnail:
            thumbnails = info.get("thumbnails") or []
            if thumbnails:
                thumbnail = thumbnails[-1].get("url")

        return (title, seconds_to_time(duration_sec), views, thumbnail)

    async def title(self, link: str, videoid: Union[bool, str] = None):
        return (await self.details(link, videoid))[0]

    async def duration(self, link: str, videoid: Union[bool, str] = None):
        return (await self.details(link, videoid))[1]

    async def thumbnail(self, link: str, videoid: Union[bool, str] = None):
        return (await self.details(link, videoid))[3]

    async def track(self, link: str, videoid: Union[bool, str] = None):
        if videoid:
            link = self.base + str(link)

        info = await asyncio.to_thread(_extract_info, normalize_url(link))
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
        if videoid:
            link = self.base + str(link)

        try:
            info = await asyncio.to_thread(
                _extract_info, normalize_url(link), True, bool(video)
            )
            if not info:
                return None

            requested = info.get("requested_downloads") or []
            filepath = requested[0].get("filepath") if requested else None
            if not filepath:
                filepath = info.get("_filename")

            if filepath and Path(filepath).is_file():
                return str(Path(filepath))

            video_id = info.get("id")
            if video_id:
                matches = [
                    p for p in DOWNLOAD_DIR.glob(f"{video_id}.*")
                    if p.is_file() and not p.name.endswith((".part", ".ytdl"))
                ]
                if matches:
                    return str(max(matches, key=lambda p: p.stat().st_mtime))

            return None

        except Exception as exc:
            logger.warning("YouTube download failed: %s", type(exc).__name__)
            return None

    async def detect_platform(self, link: str):
        if extract_video_id(link):
            return "youtube", link
        return None

    async def resolve_video(self, link: str, message_id: int = 0, platform=None):
        track = await self.search(link, message_id, video=True)
        if not track:
            return None
        track.file_path = await self.download(track.url, video=True)
        return track if track.file_path else None

    async def video(self, link: str, videoid: Union[bool, str] = None):
        if videoid:
            link = self.base + str(link)
        filepath = await self.download(link, video=True)
        return (1, filepath) if filepath else (0, "Video download failed")

    async def formats(self, link: str, videoid: Union[bool, str] = None):
        if videoid:
            link = self.base + str(link)

        def extract_formats():
            with yt_dlp.YoutubeDL(_ydl_options()) as ydl:
                return ydl.extract_info(normalize_url(link), download=False)

        info = await asyncio.to_thread(extract_formats)
        formats = []

        for item in (info or {}).get("formats", []):
            if item.get("format_id"):
                formats.append({
                    "format": item.get("format"),
                    "filesize": item.get("filesize"),
                    "format_id": item.get("format_id"),
                    "ext": item.get("ext"),
                    "format_note": item.get("format_note"),
                    "yturl": normalize_url(link),
                })

        return formats, normalize_url(link)

    async def slider(
        self, link: str, query_type: int, videoid: Union[bool, str] = None
    ):
        if videoid:
            link = self.base + str(link)

        tracks = await self.search_multi(link, limit=10)
        if not 0 <= query_type < len(tracks):
            return None, None, None, None

        track = tracks[query_type]
        return (track.title, track.duration, track.thumbnail, track.id)


YouTube = YouTubeAPI