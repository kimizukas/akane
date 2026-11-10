
import asyncio
import time
from collections import defaultdict

from ntgcalls import (
    ConnectionError,
    ConnectionNotFound,
    RTMPStreamingUnsupported,
    TelegramServerError,
)
from pyrogram.types import InputMediaPhoto, Message
from pytgcalls import PyTgCalls, exceptions, types
from pytgcalls.pytgcalls_session import PyTgCallsSession

from VampireMusic import app, config, db, lang, logger, queue, thumb, userbot, yt
from VampireMusic.helpers import Media, Track, buttons
import hashlib
import hmac
import os

def _internal_stream_url(video_id: str) -> str:
    user_id = int(app.id)
    expires = int(time.time()) + 3600

    payload = f"{user_id}:{video_id}:{expires}"

    signature = hmac.new(
        str(config.BOT_TOKEN).encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    token = f"{user_id}.{expires}.{signature}"
    port = int(os.getenv("MUSIC_SERVER_PORT", "8088"))

    return (
        f"http://127.0.0.1:{port}/api/stream/"
        f"{video_id}?token={token}"
    )




class TgCall(PyTgCalls):
    def __init__(self):
        self.clients = []
        self.restarting = defaultdict(int)

    async def pause(self, chat_id: int) -> bool:
        client = await db.get_assistant(chat_id)
        await db.playing(chat_id, paused=True)

        media = queue.get_current(chat_id)
        if media and media.played_at:
            media.time += int(time.time() - media.played_at)
            media.played_at = None

        return await client.pause(chat_id)

    async def resume(self, chat_id: int) -> bool:
        client = await db.get_assistant(chat_id)
        await db.playing(chat_id, paused=False)

        media = queue.get_current(chat_id)
        if media:
            media.played_at = time.time()

        return await client.resume(chat_id)

    async def stop(self, chat_id: int) -> None:
        client = await db.get_assistant(chat_id)
        media = queue.get_current(chat_id)

        if media and media.message_id:
            try:
                await app.delete_messages(chat_id, media.message_id)
            except Exception:
                pass

        queue.clear(chat_id)
        await db.remove_call(chat_id)
        await db.set_loop(chat_id, 0)

        try:
            await client.leave_call(chat_id, close=False)
        except Exception:
            pass

    async def _get_playback_source(
        self,
        media: Media | Track,
        seek_time: int = 0,
        force_refresh: bool = False,
    ):
        if isinstance(media, Track) and not media.video:

            # Existing downloaded local files stay unchanged.
            if (
                media.file_path
                and not media.file_path.startswith(
                    ("http://", "https://")
                )
            ):
                return media.file_path, None

            # Resolve/refresh YouTube URL and populate the shared cache.
            stream = await yt.stream(
                media.id,
                force_refresh=force_refresh,
            )

            if not stream or not stream.get("url"):
                return None, None

            # Voice chat uses the same working proxy as the Mini App.
            source = _internal_stream_url(str(media.id))

            media.file_path = source
            media.stream_headers = {}

            return source, None

        if media.file_path:
            return media.file_path, None

        return None, None




    def _build_media_stream(
        self,
        media: Media | Track,
        source: str,
        stream_headers: dict | None,
        seek_time: int = 0,
    ):
        ffmpeg_parts = []

        if seek_time > 1:
            ffmpeg_parts.extend(["-ss", str(int(seek_time))])

        if not media.video:
            ffmpeg_parts.append("-vn")

        if isinstance(source, str) and source.startswith(("http://", "https://")):
            allowed_headers = (
                "User-Agent",
                "Referer",
                "Accept",
                "Accept-Language",
                "Origin",
                "Cookie",
            )

            header_lines = []
            for name in allowed_headers:
                value = (stream_headers or {}).get(name)
                if value:
                    value = str(value).replace("\r", "").replace("\n", "")
                    header_lines.append(f"{name}: {value}")

            if header_lines:
                # Real CRLF line endings are required by FFmpeg.
                header_value = "\r\n".join(header_lines) + "\r\n"
                ffmpeg_parts.extend([
                    "-headers",
                    f'"{header_value}"',
                ])

            ffmpeg_parts.extend([
                "-reconnect", "1",
                "-reconnect_streamed", "1",
                "-reconnect_delay_max", "5",
                "-rw_timeout", "15000000",
            ])

        ffmpeg_params = " ".join(ffmpeg_parts) or None

        return types.MediaStream(
            media_path=source,
            audio_parameters=types.AudioQuality.HIGH,
            video_parameters=types.VideoQuality.HD_720p,
            audio_flags=types.MediaStream.Flags.REQUIRED,
            video_flags=(
                types.MediaStream.Flags.AUTO_DETECT
                if media.video
                else types.MediaStream.Flags.IGNORE
            ),
            ffmpeg_parameters=ffmpeg_params,
        )

    async def play_media(
        self,
        chat_id: int,
        message: Message,
        media: Media | Track,
        seek_time: int = 0,
    ) -> None:
        self.restarting[chat_id] += 1

        try:
            if await db.get_call(chat_id):
                await asyncio.sleep(0.2)

            client = await db.get_assistant(chat_id)
            _lang = await lang.get_lang(chat_id)
            _thumb_mode = await db.get_thumb_mode(chat_id)
            _autoplay = await db.get_autoplay(chat_id)

            _thumb = (
                (
                    await thumb.generate(media)
                    if isinstance(media, Track)
                    else config.DEFAULT_THUMB
                )
                if config.THUMB_GEN and _thumb_mode
                else None
            )

            source, stream_headers = await self._get_playback_source(
                media,
                seek_time,
            )

            if not source:
                await message.edit_text(
                    _lang["error_no_file"].format(config.SUPPORT_CHAT)
                )
                return await self.play_next(chat_id)

            stream = self._build_media_stream(
                media,
                source,
                stream_headers,
                seek_time,
            )

            try:
                await client.play(chat_id, stream)

            except (
                exceptions.NoAudioSourceFound,
                asyncio.TimeoutError,
                TimeoutError,
            ):
                if not isinstance(media, Track) or media.video:
                    raise

                logger.warning(
                    "Playback source failed in chat %s; refreshing YouTube URL.",
                    chat_id,
                )

                source, stream_headers = await self._get_playback_source(
                    media,
                    seek_time,
                    force_refresh=True,
                )

                if not source:
                    raise exceptions.NoAudioSourceFound(str(media.id))

                stream = self._build_media_stream(
                    media,
                    source,
                    stream_headers,
                    seek_time,
                )

                await client.play(chat_id, stream)

            media.played_at = time.time()

            if seek_time:
                media.time = seek_time
            else:
                media.time = 1
                await db.add_call(chat_id)

                text = _lang["play_media"].format(
                    media.url,
                    media.title,
                    media.duration,
                    media.user,
                )

                keyboard = buttons.controls(
                    chat_id,
                    lang=_lang,
                    autoplay=_autoplay,
                )

                try:
                    if _thumb:
                        await message.edit_media(
                            media=InputMediaPhoto(
                                media=_thumb,
                                caption=text,
                            ),
                            reply_markup=keyboard,
                        )
                    else:
                        await message.edit_text(
                            text,
                            reply_markup=keyboard,
                        )

                except Exception:
                    try:
                        await message.delete()
                    except Exception:
                        pass

                    if _thumb:
                        sent = await app.send_photo(
                            chat_id=chat_id,
                            photo=_thumb,
                            caption=text,
                            reply_markup=keyboard,
                        )
                    else:
                        sent = await app.send_message(
                            chat_id=chat_id,
                            text=text,
                            reply_markup=keyboard,
                        )

                    media.message_id = sent.id

        except FileNotFoundError:
            await message.edit_text(
                _lang["error_no_file"].format(config.SUPPORT_CHAT)
            )
            await self.play_next(chat_id)

        except exceptions.NoActiveGroupCall:
            await self.stop(chat_id)
            await message.edit_text(_lang["error_no_call"])

        except exceptions.NoAudioSourceFound:
            await message.edit_text(_lang["error_no_audio"])
            await self.play_next(chat_id)

        except (asyncio.TimeoutError, TimeoutError):
            await message.edit_text(_lang["error_tg_server"])
            await self.play_next(chat_id)

        except (ConnectionError, ConnectionNotFound, TelegramServerError):
            await self.stop(chat_id)
            await message.edit_text(_lang["error_tg_server"])

        except RTMPStreamingUnsupported:
            await self.stop(chat_id)
            await message.edit_text(_lang["error_rtmp"])

        except Exception as exc:
            logger.exception(
                "Playback failed in chat %s: %s",
                chat_id,
                type(exc).__name__,
            )

            try:
                await message.edit_text(_lang["error_no_audio"])
            except Exception:
                pass

            await self.play_next(chat_id)

        finally:
            self.restarting[chat_id] -= 1

    async def replay(self, chat_id: int) -> None:
        if not await db.get_call(chat_id):
            return

        media = queue.get_current(chat_id)
        if not media:
            return

        if media.message_id:
            try:
                await app.delete_messages(chat_id, media.message_id)
            except Exception:
                pass

        if isinstance(media, Track) and not media.video:
            media.file_path = None
            media.stream_headers = {}

        _lang = await lang.get_lang(chat_id)
        msg = await app.send_message(
            chat_id=chat_id,
            text=_lang["play_again"],
        )
        media.message_id = msg.id

        await self.play_media(chat_id, msg, media)

    async def play_next(
        self,
        chat_id: int,
        skip_user: str = None,
    ) -> None:
        if loop := await db.get_loop(chat_id):
            await db.set_loop(chat_id, loop - 1)
            return await self.replay(chat_id)

        _lang = await lang.get_lang(chat_id)
        current = queue.get_current(chat_id)

        if current and current.message_id:
            try:
                await app.delete_messages(chat_id, current.message_id)
            except Exception:
                pass

        media = queue.get_next(chat_id, check=True)

        if not media:
            autoplay_enabled = await db.get_autoplay(chat_id)

            if autoplay_enabled and current and isinstance(current, Track):
                tracks = await yt.search_multi(
                    query=current.title,
                    m_id=0,
                    video=current.video,
                    limit=10,
                )

                tracks = [
                    track for track in tracks
                    if track.id != current.id
                ]

                if tracks:
                    import random
                    media = random.choice(tracks)
                    media.user = "🔄 ᴀᴜᴛᴏᴘʟᴀʏ"
                else:
                    await self.stop(chat_id)
                    if skip_user:
                        await app.send_message(
                            chat_id,
                            _lang["play_skipped"].format(skip_user),
                        )
                    return await app.send_message(
                        chat_id,
                        _lang["queue_finished"],
                    )
            else:
                await self.stop(chat_id)
                if skip_user:
                    await app.send_message(
                        chat_id,
                        _lang["play_skipped"].format(skip_user),
                    )
                return await app.send_message(
                    chat_id,
                    _lang["queue_finished"],
                )
        else:
            media = queue.get_next(chat_id)
            if not media:
                await self.stop(chat_id)
                return await app.send_message(
                    chat_id,
                    _lang["queue_finished"],
                )

        msg = None

        if media.message_id:
            try:
                msg = await app.get_messages(chat_id, media.message_id)
                if not msg or not msg.id or msg.empty:
                    msg = None
                else:
                    try:
                        text = (
                            _lang["play_skipped"].format(skip_user)
                            + "\n\n"
                            + _lang["play_next"]
                            if skip_user
                            else _lang["play_next"]
                        )
                        await msg.edit_text(text)
                    except Exception:
                        pass
            except Exception:
                msg = None

        if not msg:
            text = (
                _lang["play_skipped"].format(skip_user)
                + "\n\n"
                + _lang["play_next"]
                if skip_user
                else _lang["play_next"]
            )
            msg = await app.send_message(
                chat_id=chat_id,
                text=text,
            )

        if not media.file_path and media.video:
            media.file_path = await yt.download(
                media.id,
                video=True,
            )

            if not media.file_path:
                try:
                    await msg.edit_text(
                        _lang["error_no_file"].format(config.SUPPORT_CHAT)
                    )
                except Exception:
                    pass
                return await self.play_next(chat_id)

        media.message_id = msg.id
        await self.play_media(chat_id, msg, media)

    async def ping(self) -> float:
        pings = [client.ping for client in self.clients]
        if not pings:
            return 0.0
        return round(sum(pings) / len(pings), 2)

    async def _delete_msg(self, message: Message, delay: int = 2):
        await asyncio.sleep(delay)
        try:
            await message.delete()
        except Exception:
            pass

    async def decorators(self, client: PyTgCalls) -> None:
        @client.on_update()
        async def update_handler(_, update: types.Update) -> None:
            if isinstance(update, types.UpdatedGroupCallParticipant):
                if not await db.get_vclogger(update.chat_id):
                    return

                try:
                    user = await app.get_users(update.participant.user_id)
                except Exception:
                    return

                _lang = await lang.get_lang(update.chat_id)

                if update.action == types.GroupCallParticipant.Action.JOINED:
                    text = _lang["vclog_joined"].format(
                        user.mention,
                        user.id,
                    )
                elif update.action == types.GroupCallParticipant.Action.LEFT:
                    text = _lang["vclog_left"].format(
                        user.mention,
                        user.id,
                    )
                else:
                    return

                try:
                    sent = await app.send_message(update.chat_id, text)
                    asyncio.create_task(self._delete_msg(sent))
                except Exception:
                    pass

            elif isinstance(update, types.StreamEnded):
                if update.stream_type == types.StreamEnded.Type.AUDIO:
                    if self.restarting.get(update.chat_id):
                        return
                    await self.play_next(update.chat_id)

            elif isinstance(update, types.ChatUpdate):
                if update.status in [
                    types.ChatUpdate.Status.KICKED,
                    types.ChatUpdate.Status.LEFT_GROUP,
                    types.ChatUpdate.Status.CLOSED_VOICE_CHAT,
                ]:
                    await self.stop(update.chat_id)

    async def boot(self) -> None:
        PyTgCallsSession.notice_displayed = True

        for ub in userbot.clients:
            client = PyTgCalls(
                ub,
                cache_duration=100,
            )
            await client.start()
            self.clients.append(client)
            await self.decorators(client)

        logger.info("PyTgCalls client(s) started.")
