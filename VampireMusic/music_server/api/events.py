from __future__ import annotations

import asyncio

from collections import defaultdict
from typing import Any


class EventHub:
    """
    In-process event hub for a single Uvicorn worker.

    This supports live user and group events without Redis. For multiple
    Uvicorn workers, replace this with a Redis pub/sub implementation.
    """

    def __init__(self, queue_size: int = 100):
        self.queue_size = queue_size
        self._topics: dict[str, set[asyncio.Queue]] = defaultdict(set)
        self._queue_topics: dict[
            asyncio.Queue,
            set[str],
        ] = defaultdict(set)

        self._lock = asyncio.Lock()

    async def subscribe(
        self,
        topic: str,
    ) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(
            maxsize=self.queue_size,
        )

        async with self._lock:
            self._topics[topic].add(queue)
            self._queue_topics[queue].add(topic)

        return queue

    async def add_topic(
        self,
        queue: asyncio.Queue,
        topic: str,
    ) -> None:
        async with self._lock:
            self._topics[topic].add(queue)
            self._queue_topics[queue].add(topic)

    async def unsubscribe_all(
        self,
        queue: asyncio.Queue,
    ) -> None:
        async with self._lock:
            topics = self._queue_topics.pop(
                queue,
                set(),
            )

            for topic in topics:
                listeners = self._topics.get(topic)

                if listeners is None:
                    continue

                listeners.discard(queue)

                if not listeners:
                    self._topics.pop(topic, None)

    async def publish(
        self,
        topic: str,
        event: dict[str, Any],
    ) -> int:
        async with self._lock:
            listeners = list(
                self._topics.get(topic, set())
            )

        delivered = 0

        for queue in listeners:
            try:
                queue.put_nowait(event)
                delivered += 1

            except asyncio.QueueFull:
                # Drop the oldest event to avoid unbounded memory growth.
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

    async def publish_user(
        self,
        user_id: int,
        event: dict[str, Any],
    ) -> int:
        return await self.publish(
            f"user:{int(user_id)}",
            event,
        )

    async def publish_group(
        self,
        chat_id: int,
        event: dict[str, Any],
    ) -> int:
        return await self.publish(
            f"group:{int(chat_id)}",
            event,
        )

    async def subscriber_count(
        self,
        topic: str,
    ) -> int:
        async with self._lock:
            return len(
                self._topics.get(topic, set())
            )


event_hub = EventHub()