
from pathlib import Path

from pyrogram import filters, types

from VampireMusic import app, VampireMusic, config, db, lang, queue, tg, yt
from VampireMusic.helpers import buttons, utils
from VampireMusic.helpers._play import checkUB


def playlist_to_queue(chat_id: int, tracks: list) -> str:
    text = "<blockquote expandable>"

    for track in tracks:
        pos = queue.add(chat_id, track)
        text += f"<b>{pos}.</b> {track.title}\n"

    VampireMusic.schedule_prefetch(chat_id)

    return text[:1948] + "</blockquote>"


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
        file = await tg.download(
            m.reply_to_message,
            sent,
        )

    elif video and url and (alt := await yt.detect_platform(url)):
        file = await yt.resolve_video(
            alt[1],
            sent.id,
            platform=alt[0],
        )

        if not file:
            return await sent.edit_text(
                m.lang["play_not_found"].format(config.SUPPORT_CHAT)
            )

    elif m3u8:
        file = await tg.process_m3u8(
            url,
            sent.id,
            video,
        )

    elif url:
        if "playlist" in url:
            await sent.edit_text(m.lang["playlist_fetch"])

            tracks = await yt.playlist(
                url,
                config.PLAYLIST_LIMIT,
                user_id=mention,
                video=video,
            )

            if not tracks:
                return await sent.edit_text(m.lang["playlist_error"])

            file = tracks[0]
            tracks.remove(file)
            file.message_id = sent.id

        else:
            file = await yt.search(
                url,
                sent.id,
                video=video,
            )

        if not file:
            return await sent.edit_text(
                m.lang["play_not_found"].format(config.SUPPORT_CHAT)
            )

    elif len(m.command) >= 2:
        query = " ".join(m.command[1:])

        file = await yt.search(
            query,
            sent.id,
            video=video,
        )

        if not file:
            return await sent.edit_text(
                m.lang["play_not_found"].format(config.SUPPORT_CHAT)
            )

    if not file:
        return await sent.edit_text(m.lang["play_usage"])

    if video and file.id and not file.file_path:
        resolved = await yt.resolve_video(
            file.id,
            file.message_id,
        )

        if resolved:
            file = resolved

    if file.duration_sec > config.DURATION_LIMIT:
        return await sent.edit_text(
            m.lang["play_duration_limit"].format(
                config.DURATION_LIMIT // 60
            )
        )

    # YouTube-only playback logging. No Lily/NexGen provider handling.
    if await db.is_logger():
        api_key = config.API_KEY or ""

        if len(api_key) > 10:
            masked_key = f"{api_key[:6]}…{api_key[-4:]}"
        elif api_key:
            masked_key = api_key[:2] + "***"
        else:
            masked_key = "<unset>"

        await utils.play_log(
            m,
            sent.link,
            file.title,
            file.duration,
            "youtube",
            masked_key,
            "youtube",
        )

    file.user = mention

    if force:
        current = queue.get_current(m.chat.id)

        if current and current.message_id:
            try:
                await app.delete_messages(
                    m.chat.id,
                    current.message_id,
                )
            except Exception:
                pass

        queue.force_add(
            m.chat.id,
            file,
        )

    else:
        position = queue.add(
            m.chat.id,
            file,
        )

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
                    m.chat.id,
                    file.id,
                    m.lang["play_now"],
                ),
            )

            VampireMusic.schedule_prefetch(m.chat.id)

            if tracks:
                added = playlist_to_queue(
                    m.chat.id,
                    tracks,
                )

                await app.send_message(
                    chat_id=m.chat.id,
                    text=m.lang["playlist_queued"].format(len(tracks)) + added,
                )

            return

    # Existing local files are reused.
    # Audio is streamed directly by VampireMusic.play_media().
    if not file.file_path:
        fname = f"downloads/{file.id}.{'mp4' if video else 'webm'}"

        if Path(fname).is_file():
            file.file_path = fname

        elif video:
            await sent.edit_text(m.lang["play_downloading"])

            file.file_path = await yt.download(
                file.id,
                video=True,
            )

            if not file.file_path:
                return await sent.edit_text(
                    m.lang["error_no_file"].format(config.SUPPORT_CHAT)
                )

    await VampireMusic.play_media(
        chat_id=m.chat.id,
        message=sent,
        media=file,
    )

    if not tracks:
        return

    added = playlist_to_queue(
        m.chat.id,
        tracks,
    )

    await app.send_message(
        chat_id=m.chat.id,
        text=m.lang["playlist_queued"].format(len(tracks)) + added,
    )
