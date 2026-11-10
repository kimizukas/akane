
import asyncio
import importlib
import signal
from contextlib import suppress

from VampireMusic import (
    app,
    VampireMusic,
    config,
    db,
    logger,
    stop,
    thumb,
    userbot,
    yt,
)
from VampireMusic.plugins import all_modules
from VampireMusic.music_server.server import start_server, stop_server


async def idle():
    loop = asyncio.get_running_loop()
    stop_event = asyncio.Event()

    for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGABRT):
        with suppress(NotImplementedError):
            loop.add_signal_handler(sig, stop_event.set)

    await stop_event.wait()


async def main():
    await db.connect()

    try:
        await thumb.start()
        await app.boot()
        await userbot.boot()
        await VampireMusic.boot()

        for module in all_modules:
            importlib.import_module(f"VampireMusic.plugins.{module}")

        logger.info("Loaded %s modules.", len(all_modules))

        if config.COOKIES_URL:
            for cookie_url in config.COOKIES_URL:
                if await yt.save_cookies(cookie_url):
                    break

        sudoers = await db.get_sudoers()
        app.sudoers.update(sudoers)
        app.bl_users.update(await db.get_blacklisted())

        logger.info("Loaded %s sudo users.", len(app.sudoers))

        await start_server()
        await idle()

    finally:
        await stop_server()
        await stop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
