import asyncio
import hashlib
import hmac
import os
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


def _internal_stream_url(video_id: str) -> str:
    user_id = int(app.id)
    expires = int(time.time()) + 45 * 60
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
        # PyTgCalls instances are created for each assistant in boot().
        self.clients = []

        # Suppress stream-ended updates while a stream is being replaced.
        self.restarting = defaultdict(int)

        # A new play/stop request invalidates older pending playback work.
        self._generation = defaultdict(int)

        # Serialize native call operations and queue transitions per chat.
        self._play_locks = defaultdict(asyncio.Lock)
        self._next_locks = defaultdict(asyncio.Lock)

        # Thumbnail generation is CPU/RAM intensive; only one at a time.
        self._thumbnail_semaphore = asyncio.Semaphore(1)

        # Limit simultaneous cold YouTube stream resolutions for VC.
        self._source_semaphore = asyncio.Semaphore(2)

        # Track background next-track prefetches.
        self._prefetch_tasks = {}

        # Some native call updates can be emitted more than once.
        self._last_stream_end = {}

    def _bump_generation(self, chat_id: int) -> int:
        self._generation[chat_id] += 1
        return self._generation[chat_id]

    def _is_generation_current(self, chat_id: int, generation: int) -> bool:
        return self._generation.get(chat_id, 0) == generation

    def _is_current(
        self,
        chat_id: int,
        generation: int,
        media: Media | Track,
    ) -> bool:
        return (
            self._is_generation_current(chat_id, generation)
            and queue.get_current(chat_id) is media
        )

    def _begin_restart(self, chat_id: int) -> None:
        self.restarting[chat_id] += 1

    def _end_restart(self, chat_id: int) -> None:
        count = self.restarting.get(chat_id, 0)
        if count <= 1:
            self.restarting.pop(chat_id, None)
        else:
            self.restarting[chat_id] = count - 1

    async def _safe_edit_text(self, message: Message, text: str) -> None:
        try:
            await message.edit_text(text)
        except Exception:
            pass

    async def pause(self, chat_id: int) -> bool:
        client = await db.get_assistant(chat_id)
        media = queue.get_current(chat_id)
        generation = self._generation.get(chat_id, 0)

        if media is None:
            return False

        async with self._play_locks[chat_id]:
            if not self._is_current(chat_id, generation, media):
                return False

            result = await client.pause(chat_id)
            if not result:
                return result

            if not self._is_current(chat_id, generation, media):
                return result

            if media and media.played_at:
                media.time += int(time.time() - media.played_at)
                media.played_at = None

            await db.playing(chat_id, paused=True)
            return result

    async def resume(self, chat_id: int) -> bool:
        client = await db.get_assistant(chat_id)
        media = queue.get_current(chat_id)
        generation = self._generation.get(chat_id, 0)

        if media is None:
            return False

        async with self._play_locks[chat_id]:
            if not self._is_current(chat_id, generation, media):
                return False

            result = await client.resume(chat_id)
            if not result:
                return result

            if not self._is_current(chat_id, generation, media):
                return result

            if media:
                media.played_at = time.time()

            await db.playing(chat_id, paused=False)
            return result

    async def stop(self, chat_id: int) -> None:
        # Invalidate pending source resolution before waiting on native calls.
        generation = self._bump_generation(chat_id)
        self._begin_restart(chat_id)

        media = queue.get_current(chat_id)
        queue.clear(chat_id)

        try:
            try:
                client = await db.get_assistant(chat_id)
            except Exception:
                client = None
                logger.exception(
                    "Unable to get assistant while stopping chat %s.",
                    chat_id,
                )

            async with self._play_locks[chat_id]:
                # A newer play request may have arrived while we waited.
                # In that case it owns the call and must not be stopped here.
                if self._is_generation_current(chat_id, generation):
                    if client:
                        try:
                            await client.leave_call(chat_id, close=False)
                        except ConnectionNotFound:
                            pass
                        except Exception as exc:
                            # NotInCallError is harmless when the call already ended.
                            if type(exc).__name__ not in {
                                "NotInCallError",
                                "NoActiveGroupCall",
                            }:
                                logger.exception(
                                    "Native call cleanup failed in chat %s.",
                                    chat_id,
                                )

                    # Do not clear database state if a new play started meanwhile.
                    if self._is_generation_current(chat_id, generation):
                        try:
                            await db.remove_call(chat_id)
                        except Exception:
                            logger.exception(
                                "Failed to remove active call state in chat %s.",
                                chat_id,
                            )

                        try:
                            await db.set_loop(chat_id, 0)
                        except Exception:
                            logger.exception(
                                "Failed to reset loop state in chat %s.",
                                chat_id,
                            )

            if media:
                media.played_at = None
                if media.message_id:
                    try:
                        await app.delete_messages(chat_id, media.message_id)
                    except Exception:
                        pass

            self._last_stream_end.pop(chat_id, None)

        finally:
            self._end_restart(chat_id)

    async def _get_playback_source(
        self,
        media: Media | Track,
        seek_time: int = 0,
        force_refresh: bool = False,
    ):
        if isinstance(media, Track) and not media.video:
            # Reuse a local file when one is already available.
            if (
                media.file_path
                and not media.file_path.startswith(("http://", "https://"))
            ):
                return media.file_path, None

            async with self._source_semaphore:
                stream = await yt.stream(
                    media.id,
                    force_refresh=force_refresh,
                )

            if not stream or not stream.get("url"):
                return None, None

            # PyTgCalls reads the local proxy; the proxy handles YouTube headers.
            source = _internal_stream_url(str(media.id))
            media.file_path = source
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
            ffmpeg_parts.extend([
                "-ss",
                str(int(seek_time)),
            ])

        if not media.video:
            ffmpeg_parts.append("-vn")

        if isinstance(source, str) and source.startswith(
            ("http://", "https://")
        ):
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

        # --audio selects the audio stream.
        # -atmid puts -af after the input, where FFmpeg expects this filter.
        ffmpeg_parts.extend([
            "--audio",
            "-atmid",
            "-af",
            '"volume=1.08,alimiter=limit=0.98:level=false"',
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

    def schedule_prefetch(self, chat_id: int) -> None:
        items = queue.get_queue(chat_id)

        if len(items) < 2:
            return

        next_media = items[1]

        if not isinstance(next_media, Track) or next_media.video:
            return

        task_key = (
            int(chat_id),
            str(next_media.id),
        )

        existing = self._prefetch_tasks.get(task_key)

        if existing and not existing.done():
            return

        # Prevent a large number of background jobs on a small VPS.
        if len(self._prefetch_tasks) >= 8:
            return

        task = asyncio.create_task(
            self._prefetch_track(
                chat_id,
                next_media,
            )
        )

        self._prefetch_tasks[task_key] = task

        def cleanup(done_task):
            if self._prefetch_tasks.get(task_key) is done_task:
                self._prefetch_tasks.pop(task_key, None)

            try:
                done_task.result()
            except asyncio.CancelledError:
                pass
            except Exception as exc:
                logger.debug(
                    "Next-track prefetch task failed in chat %s: %s",
                    chat_id,
                    type(exc).__name__,
                )

        task.add_done_callback(cleanup)

    async def _prefetch_track(
        self,
        chat_id: int,
        media: Track,
    ) -> None:
        try:
            items = queue.get_queue(chat_id)

            if len(items) < 2 or items[1] is not media:
                return

            async with self._source_semaphore:
                # The queue may have changed while this task was waiting.
                items = queue.get_queue(chat_id)

                if len(items) < 2 or items[1] is not media:
                    return

                stream = await yt.stream(str(media.id))

            if stream and stream.get("url"):
                logger.debug(
                    "Next track source prefetched in chat %s: %s",
                    chat_id,
                    media.id,
                )

        except asyncio.CancelledError:
            raise

        except Exception as exc:
            logger.debug(
                "Next-track prefetch failed in chat %s: %s",
                chat_id,
                type(exc).__name__,
            )

    async def _start_stream(
        self,
        chat_id: int,
        client: PyTgCalls,
        media: Media | Track,
        stream: types.MediaStream,
        generation: int,
        seek_time: int = 0,
    ) -> bool:
        async with self._play_locks[chat_id]:
            if not self._is_current(chat_id, generation, media):
                return False

            await client.play(chat_id, stream)

            # Stop/skip can invalidate this request while client.play awaits.
            if not self._is_current(chat_id, generation, media):
                return False

            media.played_at = time.time()
            if seek_time:
                media.time = seek_time
            else:
                media.time = 1
                await db.add_call(chat_id)

            return self._is_current(chat_id, generation, media)

    async def _update_now_playing(
        self,
        chat_id: int,
        message: Message,
        media: Media | Track,
        generation: int,
        language: dict,
        autoplay: bool,
        thumb_mode: bool,
    ) -> None:
        if not self._is_current(chat_id, generation, media):
            return

        thumbnail = None
        if config.THUMB_GEN and thumb_mode:
            try:
                if isinstance(media, Track):
                    async with self._thumbnail_semaphore:
                        if not self._is_current(chat_id, generation, media):
                            return
                        thumbnail = await thumb.generate(media)
                else:
                    thumbnail = config.DEFAULT_THUMB
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning(
                    "Thumbnail generation failed in chat %s: %s",
                    chat_id,
                    type(exc).__name__,
                )

        if not self._is_current(chat_id, generation, media):
            return

        text = language["play_media"].format(
            media.url,
            media.title,
            media.duration,
            media.user,
        )
        keyboard = buttons.controls(
            chat_id,
            lang=language,
            autoplay=autoplay,
        )

        try:
            if thumbnail:
                await message.edit_media(
                    media=InputMediaPhoto(
                        media=thumbnail,
                        caption=text,
                    ),
                    reply_markup=keyboard,
                )
            else:
                await message.edit_text(
                    text,
                    reply_markup=keyboard,
                )

            if self._is_current(chat_id, generation, media):
                media.message_id = message.id
            return

        except asyncio.CancelledError:
            raise
        except Exception:
            pass

        if not self._is_current(chat_id, generation, media):
            return

        try:
            await message.delete()
        except Exception:
            pass

        if not self._is_current(chat_id, generation, media):
            return

        sent = None
        if thumbnail:
            try:
                sent = await app.send_photo(
                    chat_id=chat_id,
                    photo=thumbnail,
                    caption=text,
                    reply_markup=keyboard,
                )
            except Exception:
                sent = None

        if not sent:
            try:
                sent = await app.send_message(
                    chat_id=chat_id,
                    text=text,
                    reply_markup=keyboard,
                )
            except Exception:
                sent = None

        if sent and self._is_current(chat_id, generation, media):
            media.message_id = sent.id

    async def play_media(
        self,
        chat_id: int,
        message: Message,
        media: Media | Track,
        seek_time: int = 0,
    ) -> None:
        generation = self._bump_generation(chat_id)
        self._begin_restart(chat_id)
        transition_active = True
        language = None

        try:
            language = await lang.get_lang(chat_id)
            if not self._is_current(chat_id, generation, media):
                return

            client, thumb_mode, autoplay, playback_source = await asyncio.gather(
                db.get_assistant(chat_id),
                db.get_thumb_mode(chat_id),
                db.get_autoplay(chat_id),
                self._get_playback_source(media, seek_time),
            )

            if not self._is_current(chat_id, generation, media):
                return

            source, stream_headers = playback_source
            if not source:
                await self._safe_edit_text(
                    message,
                    language["error_no_file"].format(config.SUPPORT_CHAT),
                )
                if self._is_current(chat_id, generation, media):
                    await self.play_next(chat_id)
                return

            stream = self._build_media_stream(
                media,
                source,
                stream_headers,
                seek_time,
            )

            try:
                started = await self._start_stream(
                    chat_id,
                    client,
                    media,
                    stream,
                    generation,
                    seek_time,
                )
            except (
                exceptions.NoAudioSourceFound,
                asyncio.TimeoutError,
                TimeoutError,
            ):
                if not self._is_current(chat_id, generation, media):
                    return
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

                if not self._is_current(chat_id, generation, media):
                    return
                if not source:
                    raise exceptions.NoAudioSourceFound(str(media.id))

                stream = self._build_media_stream(
                    media,
                    source,
                    stream_headers,
                    seek_time,
                )
                started = await self._start_stream(
                    chat_id,
                    client,
                    media,
                    stream,
                    generation,
                    seek_time,
                )

            if not started:
                return

            # Native playback is live. Do not keep the transition flag set
            # while generating a thumbnail or editing Telegram messages.
            self.schedule_prefetch(chat_id)
            self._end_restart(chat_id)
            transition_active = False

            if seek_time:
                return

            await self._update_now_playing(
                chat_id,
                message,
                media,
                generation,
                language,
                autoplay,
                thumb_mode,
            )

        except asyncio.CancelledError:
            raise

        except FileNotFoundError:
            if self._is_current(chat_id, generation, media):
                if language:
                    await self._safe_edit_text(
                        message,
                        language["error_no_file"].format(config.SUPPORT_CHAT),
                    )
                await self.play_next(chat_id, skip_loop=True)

        except exceptions.NoActiveGroupCall:
            if not self._is_current(chat_id, generation, media):
                return
            await self.stop(chat_id)
            if language:
                await self._safe_edit_text(message, language["error_no_call"])

        except exceptions.NoAudioSourceFound:
            if self._is_current(chat_id, generation, media):
                if language:
                    await self._safe_edit_text(
                        message,
                        language["error_no_audio"],
                    )
                await self.play_next(chat_id, skip_loop=True)

        except (asyncio.TimeoutError, TimeoutError):
            if self._is_current(chat_id, generation, media):
                if language:
                    await self._safe_edit_text(
                        message,
                        language["error_tg_server"],
                    )
                await self.play_next(chat_id, skip_loop=True)

        except (ConnectionError, ConnectionNotFound, TelegramServerError):
            if not self._is_current(chat_id, generation, media):
                return
            await self.stop(chat_id)
            if language:
                await self._safe_edit_text(
                    message,
                    language["error_tg_server"],
                )

        except RTMPStreamingUnsupported:
            if not self._is_current(chat_id, generation, media):
                return
            await self.stop(chat_id)
            if language:
                await self._safe_edit_text(message, language["error_rtmp"])

        except Exception as exc:
            logger.exception(
                "Playback failed in chat %s: %s",
                chat_id,
                type(exc).__name__,
            )
            if self._is_current(chat_id, generation, media):
                if language:
                    await self._safe_edit_text(
                        message,
                        language["error_no_audio"],
                    )
                await self.play_next(chat_id, skip_loop=True)

        finally:
            if transition_active:
                self._end_restart(chat_id)

    async def replay(self, chat_id: int) -> None:
        media = queue.get_current(chat_id)
        if not media:
            return

        generation = self._generation.get(chat_id, 0)
        language = await lang.get_lang(chat_id)

        if not self._is_current(chat_id, generation, media):
            return

        message = None
        if media.message_id:
            try:
                message = await app.get_messages(chat_id, media.message_id)
                if not message or not message.id or message.empty:
                    message = None
            except Exception:
                message = None

        if not self._is_current(chat_id, generation, media):
            return

        if not message:
            message = await app.send_message(
                chat_id=chat_id,
                text=language["play_next"],
            )

        if not self._is_current(chat_id, generation, media):
            try:
                await message.delete()
            except Exception:
                pass
            return

        media.message_id = message.id
        media.time = 0
        media.played_at = None

        await self.play_media(
            chat_id,
            message,
            media,
        )

    async def play_next(
        self,
        chat_id: int,
        skip_user: str = None,
        *,
        skip_loop: bool = False,
    ) -> None:
        selected = None
        replay_current = None
        retry_next = False

        async with self._next_locks[chat_id]:
            generation = self._bump_generation(chat_id)
            self._begin_restart(chat_id)

            try:
                current = queue.get_current(chat_id)

                if not skip_loop:
                    loop_count = await db.get_loop(chat_id)
                    if not self._is_generation_current(chat_id, generation):
                        return

                    if loop_count and current:
                        await db.set_loop(chat_id, loop_count - 1)
                        if (
                            self._is_generation_current(chat_id, generation)
                            and queue.get_current(chat_id) is current
                        ):
                            replay_current = current

                if replay_current is None:
                    language = await lang.get_lang(chat_id)
                    if not self._is_generation_current(chat_id, generation):
                        return

                    if current and current.message_id:
                        try:
                            await app.delete_messages(
                                chat_id,
                                current.message_id,
                            )
                        except Exception:
                            pass

                        if (
                            not self._is_generation_current(chat_id, generation)
                            or queue.get_current(chat_id) is not current
                        ):
                            return

                    candidate = queue.get_next(chat_id, check=True)

                    if candidate:
                        media = queue.get_next(chat_id)
                        if not media:
                            return
                    else:
                        autoplay_enabled = await db.get_autoplay(chat_id)
                        if (
                            not self._is_generation_current(chat_id, generation)
                            or queue.get_current(chat_id) is not current
                        ):
                            return

                        tracks = []
                        if autoplay_enabled and isinstance(current, Track):
                            tracks = await yt.search_multi(
                                query=current.title,
                                m_id=0,
                                video=current.video,
                                limit=10,
                            )

                            if (
                                not self._is_generation_current(chat_id, generation)
                                or queue.get_current(chat_id) is not current
                            ):
                                return

                            tracks = [
                                track for track in (tracks or [])
                                if track.id != current.id
                            ]

                        if tracks:
                            import random

                            media = random.choice(tracks)
                            media.user = "🔄 ᴀᴜᴛᴏᴘʟᴀʏ"
                            queue.force_add(chat_id, media)
                        else:
                            await self.stop(chat_id)

                            if skip_user:
                                try:
                                    await app.send_message(
                                        chat_id,
                                        language["play_skipped"].format(skip_user),
                                    )
                                except Exception:
                                    pass

                            if queue.get_current(chat_id) is not None:
                                return

                            try:
                                await app.send_message(
                                    chat_id,
                                    language["queue_finished"],
                                )
                            except Exception:
                                pass
                            return

                    if not self._is_generation_current(chat_id, generation):
                        return
                    if queue.get_current(chat_id) is not media:
                        return

                    message = None
                    if media.message_id:
                        try:
                            message = await app.get_messages(
                                chat_id,
                                media.message_id,
                            )
                            if not message or not message.id or message.empty:
                                message = None
                            else:
                                text = (
                                    language["play_skipped"].format(skip_user)
                                    + "\n\n"
                                    + language["play_next"]
                                    if skip_user
                                    else language["play_next"]
                                )
                                try:
                                    await message.edit_text(text)
                                except Exception:
                                    pass
                        except Exception:
                            message = None

                    if not self._is_generation_current(chat_id, generation):
                        return
                    if queue.get_current(chat_id) is not media:
                        return

                    if not message:
                        text = (
                            language["play_skipped"].format(skip_user)
                            + "\n\n"
                            + language["play_next"]
                            if skip_user
                            else language["play_next"]
                        )
                        message = await app.send_message(
                            chat_id=chat_id,
                            text=text,
                        )

                    if not self._is_generation_current(chat_id, generation):
                        try:
                            await message.delete()
                        except Exception:
                            pass
                        return
                    if queue.get_current(chat_id) is not media:
                        return

                    if not media.file_path and media.video:
                        media.file_path = await yt.download(
                            media.id,
                            video=True,
                        )

                        if not self._is_generation_current(chat_id, generation):
                            return
                        if queue.get_current(chat_id) is not media:
                            return

                        if not media.file_path:
                            await self._safe_edit_text(
                                message,
                                language["error_no_file"].format(
                                    config.SUPPORT_CHAT
                                ),
                            )
                            retry_next = True

                    if not retry_next:
                        media.message_id = message.id
                        selected = (message, media, generation)

            finally:
                self._end_restart(chat_id)

        if replay_current:
            if (
                self._is_generation_current(chat_id, generation)
                and queue.get_current(chat_id) is replay_current
            ):
                await self.replay(chat_id)
            return

        if retry_next:
            if self._is_generation_current(chat_id, generation):
                await self.play_next(
                    chat_id,
                    skip_user,
                    skip_loop=True,
                )
            return

        if not selected:
            return

        message, media, generation = selected
        if self._is_current(chat_id, generation, media):
            await self.play_media(chat_id, message, media)

    async def ping(self) -> float:
        pings = [client.ping for client in self.clients]
        if not pings:
            return 0.0
        return round(sum(pings) / len(pings), 2)

    async def _delete_msg(
        self,
        message: Message,
        delay: int = 2,
    ):
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

                language = await lang.get_lang(update.chat_id)

                if update.action == types.GroupCallParticipant.Action.JOINED:
                    text = language["vclog_joined"].format(
                        user.mention,
                        user.id,
                    )
                elif update.action == types.GroupCallParticipant.Action.LEFT:
                    text = language["vclog_left"].format(
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
                if update.stream_type != types.StreamEnded.Type.AUDIO:
                    return
                if self.restarting.get(update.chat_id):
                    return

                now = time.monotonic()
                previous = self._last_stream_end.get(update.chat_id, 0.0)
                if now - previous < 1.0:
                    return

                self._last_stream_end[update.chat_id] = now
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

        for assistant in userbot.clients:
            client = PyTgCalls(
                assistant,
                workers=2,
                cache_duration=100,
            )
            await client.start()
            self.clients.append(client)
            await self.decorators(client)

        logger.info("PyTgCalls client(s) started.")
