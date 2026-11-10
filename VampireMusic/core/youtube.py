import asyncio
import logging
import os
import re
import shutil
import time
from pathlib import Path
from typing import Optional, Union
from urllib.parse import parse_qs, urlparse

import aiohttp
import yt_dlp
from pyrogram.enums import MessageEntityType
from pyrogram.types import Message

from VampireMusic.helpers import Track

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
SERVER_DIR = BASE_DIR / "music_server"
DOWNLOAD_DIR = SERVER_DIR / "downloads"
COOKIES_FILE = SERVER_DIR / "cookies.txt"

YOUTUBE_URL = "https://www.youtube.com/watch?v={}"
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

_STREAM_CACHE = {}
_STREAM_CACHE_TTL = 90
_STREAM_CACHE_MAX = 256


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
    }

    if COOKIES_FILE.is_file() and COOKIES_FILE.stat().st_size:
        options["cookiefile"] = str(COOKIES_FILE)

    if download:
        options.update({
            "format": "bestvideo+bestaudio/best" if video else "bestaudio/best",
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

    for key in list(_STREAM_CACHE):
        if _STREAM_CACHE[key]["expires"] <= now:
            _STREAM_CACHE.pop(key, None)

    while len(_STREAM_CACHE) > _STREAM_CACHE_MAX:
        _STREAM_CACHE.pop(next(iter(_STREAM_CACHE)))


def _resolve_audio_stream(video_id: str):
    source = YOUTUBE_URL.format(video_id)

    options = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "ignoreerrors": False,
        "socket_timeout": 15,
        "retries": 2,
        "fragment_retries": 2,
        "format": "bestaudio/best",
        "extractor_args": {
            "youtube": {
                "player_client": ["android_vr"],
            },
        },
    }

    # android_vr is intentionally used without account cookies.
    # Its GVS requests currently do not require a PO Token.
    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(source, download=False)

    if not info or not info.get("url"):
        raise RuntimeError("Audio URL unavailable")

    return {
        "url": info["url"],
        "headers": info.get("http_headers") or {},
        "ext": info.get("ext") or "webm",
    }


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

        if force_refresh:
            invalidate_stream_cache(video_id)
        else:
            cached = _STREAM_CACHE.get(video_id)

            if cached and cached["expires"] > time.monotonic():
                return {
                    "url": cached["url"],
                    "headers": cached["headers"],
                    "ext": cached.get("ext") or "webm",
                }

            invalidate_stream_cache(video_id)

        try:
            data = await asyncio.to_thread(
                _resolve_audio_stream,
                video_id,
            )

            if not data or not data.get("url"):
                return None

            _cache_stream({
                "id": video_id,
                "url": data["url"],
                "headers": data.get("headers") or {},
                "ext": data.get("ext") or "webm",
            })

            return data

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
            logger.info("YouTube cookies loaded.")
            return True

        except Exception as exc:
            logger.error(
                "Unable to load YouTube cookies: %s",
                type(exc).__name__,
            )
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

    async def search(self, query: str, m_id: int = 0, video: bool = False):
        try:
            target = normalize_url(query)
            if not extract_video_id(target):
                target = f"ytsearch1:{query}"

            info = await asyncio.to_thread(_extract_info, target)

            if info and "entries" in info:
                info = next(
                    (entry for entry in (info.get("entries") or []) if entry),
                    None,
                )

            return _make_track(info, m_id, video)

        except Exception as exc:
            logger.warning(
                "YouTube search failed: %s",
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
        try:
            limit = max(1, min(int(limit), 20))
            info = await asyncio.to_thread(
                _extract_info,
                f"ytsearch{limit}:{query}",
            )

            tracks = []

            for entry in (info or {}).get("entries") or []:
                track = _make_track(entry, m_id, video)
                if track:
                    tracks.append(track)

            return tracks

        except Exception as exc:
            logger.warning(
                "YouTube multi-search failed: %s",
                type(exc).__name__,
            )
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
                            _extract_info,
                            normalize_url(str(video_url)),
                        )
                        entry = detail or entry
                    except Exception:
                        continue

                track = _make_track(entry, video=video)
                if track:
                    tracks.append(track)

            return tracks

        except Exception as exc:
            logger.warning(
                "YouTube playlist failed: %s",
                type(exc).__name__,
            )
            return []

    async def title(self, link: str, videoid: Union[bool, str] = None):
        details = await self.details(link, videoid)
        return details[0]

    async def duration(self, link: str, videoid: Union[bool, str] = None):
        details = await self.details(link, videoid)
        return details[1]

    async def thumbnail(self, link: str, videoid: Union[bool, str] = None):
        details = await self.details(link, videoid)
        return details[3]

    async def track(self, link: str, videoid: Union[bool, str] = None):
        if videoid:
            link = self.base + str(link)

        info = await asyncio.to_thread(
            _extract_info,
            normalize_url(link),
        )
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
                _extract_info,
                normalize_url(link),
                True,
                bool(video),
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
                    path for path in DOWNLOAD_DIR.glob(f"{video_id}.*")
                    if path.is_file()
                    and not path.name.endswith((".part", ".ytdl"))
                ]

                if matches:
                    return str(
                        max(matches, key=lambda path: path.stat().st_mtime)
                    )

            return None

        except Exception as exc:
            logger.warning(
                "YouTube download failed: %s",
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

    async def formats(
        self,
        link: str,
        videoid: Union[bool, str] = None,
    ):
        if videoid:
            link = self.base + str(link)

        def extract_formats():
            with yt_dlp.YoutubeDL(_ydl_options()) as ydl:
                return ydl.extract_info(
                    normalize_url(link),
                    download=False,
                )

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
        self,
        link: str,
        query_type: int,
        videoid: Union[bool, str] = None,
    ):
        if videoid:
            link = self.base + str(link)

        tracks = await self.search_multi(link, limit=10)

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