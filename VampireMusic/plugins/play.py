from pathlib import Path

from pyrogram import filters, types

from VampireMusic import app, VampireMusic, config, db, lang, queue, tg, yt
from VampireMusic.helpers import buttons, utils
from VampireMusic.helpers._play import checkUB




    async def playlist(
        self,
        link,
        limit,
        user_id=None,
        videoid: Union[bool, str] = None,
    ) -> list[Track]:

        # Compatibility with the existing play.py argument order:
        # playlist(limit, mention, url, video)
        if isinstance(link, int):
            link, limit, user_id = user_id, link, limit

        if videoid:
            link = self.listbase + str(link)

        try:
            limit = max(1, min(int(limit), 100))
            options = _ydl_options()
            options.update({
                "extract_flat": "in_playlist",
                "playlistend": limit,
            })

            def extract_playlist():
                with yt_dlp.YoutubeDL(options) as ydl:
                    return ydl.extract_info(link, download=False)

            info = await asyncio.to_thread(extract_playlist)
            entries = (info or {}).get("entries") or []

            tracks = []

            for entry in entries[:limit]:
                if not entry:
                    continue

                video_url = entry.get("url") or entry.get("id")
                if not video_url:
                    continue

                try:
                    detail = await asyncio.to_thread(
                        _extract_info,
                        normalize_url(video_url),
                    )
                    track = _make_track(detail)

                    if track:
                        tracks.append(track)

                except Exception:
                    continue

            return tracks

        except Exception as exc:
            logger.warning(
                "YouTube playlist failed: %s",
                type(exc).__name__,
            )
            return []






def playlist_to_queue(chat_id: int, tracks: list) -> str:
    text = "<blockquote expandable>"
    for track in tracks:
        pos = queue.add(chat_id, track)
        text += f"<b>{pos}.</b> {track.title}\n"
    text = text[:1948] + "</blockquote>"
    return text


@app.on_message(
    filters.command(["play", "playforce", "vplay", "vplayforce"])
    & filters.group
    & ~app.bl_users
)
@lang.language()
@checkUB
async def play_hndlr(
    _,
    m: types.Message,
    force: bool = False,
    m3u8: bool = False,
    video: bool = False,
    url: str = None,
) -> None:
    sent = await m.reply_text(m.lang["play_searching"])
    file = None
    mention = m.from_user.mention
    media = tg.get_media(m.reply_to_message) if m.reply_to_message else None
    tracks = []

    if media:
        setattr(sent, "lang", m.lang)
        file = await tg.download(m.reply_to_message, sent)

    elif video and url and (alt := yt.detect_platform(url)):
        # Dailymotion/Vimeo/Facebook/Bilibili video links -> resolve a
        # direct stream via lily /play (else they'd be mis-routed as m3u8).
        file = await yt.resolve_video(alt[1], sent.id, platform=alt[0])
        if not file:
            return await sent.edit_text(
                m.lang["play_not_found"].format(config.SUPPORT_CHAT)
            )

    elif m3u8:
        file = await tg.process_m3u8(url, sent.id, video)

    elif url:
        if "playlist" in url:
            await sent.edit_text(m.lang["playlist_fetch"])
            tracks = await yt.playlist(config.PLAYLIST_LIMIT, mention, url, video)

            if not tracks:
                return await sent.edit_text(m.lang["playlist_error"])

            file = tracks[0]
            tracks.remove(file)
            file.message_id = sent.id
        else:
            file = await yt.search(url, sent.id, video=video)

        if not file:
            return await sent.edit_text(
                m.lang["play_not_found"].format(config.SUPPORT_CHAT)
            )

    elif len(m.command) >= 2:
        query = " ".join(m.command[1:])
        file = await yt.search(query, sent.id, video=video)
        if not file:
            return await sent.edit_text(
                m.lang["play_not_found"].format(config.SUPPORT_CHAT)
            )

    if not file:
        return await sent.edit_text(m.lang["play_usage"])

    # Fast path for video: resolve a direct mp4 stream URL via the lily
    # /play endpoint so we stream straight to PyTgCalls (no local mkv
    # download). Falls back to the download path below if it fails.
    # Skipped when already resolved (e.g. an alt-platform link above).
    if video and file.id and not file.file_path:
        resolved = await yt.resolve_video(file.id, file.message_id)
        if resolved:
            file = resolved

    if file.duration_sec > config.DURATION_LIMIT:
        return await sent.edit_text(
            m.lang["play_duration_limit"].format(config.DURATION_LIMIT // 60)
        )

    if await db.is_logger():
        from VampireMusic.core.lily import mask_key

        src = getattr(file, "source", None)
        if src == "lily":
            prov, key, plat = "lily", config.LILY_API_KEY, config.LILY_PLATFORM
        elif src == "nexgen":
            prov, key, plat = "nexgen", config.LILY_FALLBACK_KEY, config.LILY_PLATFORM
        else:
            prov, key, plat = "youtube", config.API_KEY, "youtube"
        await utils.play_log(
            m, sent.link, file.title, file.duration, prov, mask_key(key), plat
        )

    file.user = mention
    if force:
        current = queue.get_current(m.chat.id)
        if current and current.message_id:
            try:
                await app.delete_messages(m.chat.id, current.message_id)
            except Exception:
                pass
        queue.force_add(m.chat.id, file)
    else:
        position = queue.add(m.chat.id, file)

        if position != 0 or await db.get_call(m.chat.id):
            await sent.edit_text(
                m.lang["play_queued"].format(
                    position,
                    file.url,
                    file.title,
                    file.duration,
                    m.from_user.mention,
                ),
                reply_markup=buttons.play_queued(
                    m.chat.id, file.id, m.lang["play_now"]
                ),
            )
            if tracks:
                added = playlist_to_queue(m.chat.id, tracks)
                await app.send_message(
                    chat_id=m.chat.id,
                    text=m.lang["playlist_queued"].format(len(tracks)) + added,
                )
            return

    if not file.file_path:
        fname = f"downloads/{file.id}.{'mp4' if video else 'webm'}"
        if Path(fname).exists():
            file.file_path = fname
        else:
            await sent.edit_text(m.lang["play_downloading"])
            file.file_path = await yt.download(file.id, video=video)

    await VampireMusic.play_media(chat_id=m.chat.id, message=sent, media=file)
    if not tracks:
        return
    added = playlist_to_queue(m.chat.id, tracks)
    await app.send_message(
        chat_id=m.chat.id,
        text=m.lang["playlist_queued"].format(len(tracks)) + added,
    )
