from __future__ import annotations

import asyncio
import time

from collections import defaultdict
from typing import Any


class EventHub:
    """
    In-process event hub for a single Uvicorn worker.
    Queues are strictly bounded, and subscribers are cleaned up
    deterministically to avoid RAM growth under long uptime.
    """

    def __init__(self, queue_size: int = 64, max_topics: int = 4096):
        self.queue_size = max(16, min(int(queue_size), 256))
        self.max_topics = max(128, int(max_topics))

        self._topics: dict[str, dict[asyncio.Queue, float]] = defaultdict(dict)
        self._queue_topics: dict[asyncio.Queue, set[str]] = defaultdict(set)
        self._lock = asyncio.Lock()
        self._last_cleanup = time.monotonic()

    async def _maybe_cleanup_locked(self):
        now = time.monotonic()
        if now - self._last_cleanup < 30.0:
            return
        self._last_cleanup = now

        # Remove empty topics.
        empty = [t for t, subs in self._topics.items() if not subs]
        for topic in empty:
            self._topics.pop(topic, None)

        # Hard cap on number of distinct topics.
        while len(self._topics) > self.max_topics:
            oldest = next(iter(self._topics))
            queues = list(self._topics.pop(oldest, {}).keys())
            for q in queues:
                self._queue_topics.get(q, set()).discard(oldest)

    async def subscribe(self, topic: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=self.queue_size)
        async with self._lock:
            await self._maybe_cleanup_locked()
            self._topics[topic][queue] = time.monotonic()
            self._queue_topics[queue].add(topic)
        return queue

    async def add_topic(self, queue: asyncio.Queue, topic: str) -> None:
        async with self._lock:
            self._topics[topic][queue] = time.monotonic()
            self._queue_topics[queue].add(topic)

    async def unsubscribe_all(self, queue: asyncio.Queue) -> None:
        async with self._lock:
            topics = self._queue_topics.pop(queue, set())
            for topic in topics:
                subs = self._topics.get(topic)
                if subs is None:
                    continue
                subs.pop(queue, None)
                if not subs:
                    self._topics.pop(topic, None)

    async def publish(self, topic: str, event: dict[str, Any]) -> int:
        async with self._lock:
            listeners = list(self._topics.get(topic, {}).keys())

        if not listeners:
            return 0

        delivered = 0
        for queue in listeners:
            try:
                queue.put_nowait(event)
                delivered += 1
            except asyncio.QueueFull:
                # Drop oldest, try once more.
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    queue.put_nowait(event)
                    delivered += 1
                except asyncio.QueueFull:
                    pass
        return delivered

    async def publish_user(self, user_id: int, event: dict[str, Any]) -> int:
        return await self.publish(f"user:{int(user_id)}", event)

    async def publish_group(self, chat_id: int, event: dict[str, Any]) -> int:
        return await self.publish(f"group:{int(chat_id)}", event)

    async def subscriber_count(self, topic: str) -> int:
        async with self._lock:
            return len(self._topics.get(topic, {}))


event_hub = EventHub()