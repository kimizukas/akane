
from __future__ import annotations

import asyncio
import hashlib
import json
import math
import re
import time

from collections import OrderedDict, deque
from typing import Any

from .security import (
    decode_access_token,
    verify_telegram_init_data,
)


def _headers(scope: dict[str, Any]) -> dict[str, str]:
    return {
        key.decode("latin-1").lower(): value.decode("latin-1")
        for key, value in scope.get("headers", [])
    }


def _client_key(
    scope: dict[str, Any],
    headers: dict[str, str],
) -> str:
    authorization = headers.get("authorization", "")

    if authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        user = decode_access_token(token)

        if user:
            return f"user:{int(user['id'])}"

        # An invalid bearer token still gets an isolated bucket.
        return "invalid-token:" + hashlib.sha256(
            token.encode("utf-8")
        ).hexdigest()[:24]

    init_data = headers.get("x-telegram-init-data", "")

    if init_data:
        user = verify_telegram_init_data(init_data)

        if user:
            return f"user:{int(user['id'])}"

        return "invalid-init:" + hashlib.sha256(
            init_data.encode("utf-8")
        ).hexdigest()[:24]

    client = scope.get("client")
    host = client[0] if client else "unknown"

    # Do not trust X-Forwarded-For without an explicitly trusted proxy.
    return f"ip:{host}"


def _rate_policy(
    method: str,
    path: str,
) -> tuple[int, int]:
    if path == "/api/auth/session":
        return 5, 300

    if path == "/api/auth/refresh":
        return 15, 60

    if path.startswith("/api/discover"):
        return 20, 3600

    if path.startswith("/api/uploads/"):
        return 5, 60

    if path.startswith("/api/groups/") and method in {
        "POST",
        "PATCH",
        "PUT",
        "DELETE",
    }:
        return 40, 60

    if path.startswith("/api/admin/"):
        return 60, 60

    return 120, 60


async def _send_json(
    send,
    status: int,
    payload: dict[str, Any],
    headers: list[tuple[bytes, bytes]] | None = None,
) -> None:
    body = json.dumps(
        payload,
        separators=(",", ":"),
    ).encode("utf-8")

    response_headers = [
        (b"content-type", b"application/json; charset=utf-8"),
        (b"content-length", str(len(body)).encode("ascii")),
        (b"cache-control", b"no-store"),
    ]

    if headers:
        response_headers.extend(headers)

    await send({
        "type": "http.response.start",
        "status": status,
        "headers": response_headers,
    })

    await send({
        "type": "http.response.body",
        "body": body,
        "more_body": False,
    })


class APIRateLimitMiddleware:
    """
    Process-local sliding-window rate limiter.

    This is intentionally designed for one Uvicorn worker.
    It is not a distributed limiter for multiple processes.
    """

    def __init__(
        self,
        app,
        *,
        max_entries: int = 4096,
    ):
        self.app = app
        self.max_entries = max(256, int(max_entries))
        self._buckets: OrderedDict[
            str,
            deque[float],
        ] = OrderedDict()
        self._lock = asyncio.Lock()
        self._requests = 0

    async def __call__(
        self,
        scope,
        receive,
        send,
    ):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        method = scope.get("method", "GET").upper()

        # Long-lived audio streaming is not counted as ordinary API traffic.
        if (
            not path.startswith("/api/")
            or path.startswith("/api/stream/")
            or path == "/api/ws"
        ):
            await self.app(scope, receive, send)
            return

        headers = _headers(scope)
        identity = _client_key(scope, headers)
        limit, window = _rate_policy(method, path)

        bucket_key = f"{identity}:{method}:{path}"
        now = time.monotonic()

        async with self._lock:
            events = self._buckets.get(bucket_key)

            if events is None:
                events = deque()
                self._buckets[bucket_key] = events

            while events and now - events[0] >= window:
                events.popleft()

            self._requests += 1

            if self._requests % 256 == 0:
                expired = [
                    key
                    for key, values in self._buckets.items()
                    if not values
                ]

                for key in expired:
                    self._buckets.pop(key, None)

            if len(self._buckets) > self.max_entries:
                while len(self._buckets) > self.max_entries:
                    self._buckets.popitem(last=False)

            self._buckets.move_to_end(bucket_key)

            if len(events) >= limit:
                retry_after = max(
                    1,
                    math.ceil(window - (now - events[0])),
                )
            else:
                events.append(now)
                retry_after = 0
                remaining = max(0, limit - len(events))

        if retry_after:
            await _send_json(
                send,
                429,
                {
                    "ok": False,
                    "error": "rate_limit_exceeded",
                    "retry_after": retry_after,
                },
                headers=[
                    (
                        b"retry-after",
                        str(retry_after).encode("ascii"),
                    ),
                ],
            )
            return

        await self.app(scope, receive, send)


class IdempotencyMiddleware:
    """
    In-memory idempotency for JSON mutation endpoints.

    Same key + same request returns the original response.
    Same key + different request returns HTTP 409.

    Cache is process-local and is cleared on restart. Do not use this
    as a distributed idempotency store with multiple workers.
    """

    MUTATING_METHODS = {
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
    }

    KEY_PATTERN = re.compile(
        r"^[A-Za-z0-9._:-]{8,128}$"
    )

    MAX_REQUEST_BODY = 1024 * 1024
    MAX_RESPONSE_BODY = 1024 * 1024
    CACHE_TTL = 24 * 60 * 60
    WAIT_TIMEOUT = 20
    MAX_ENTRIES = 2048

    def __init__(self, app):
        self.app = app
        self._entries: OrderedDict[
            str,
            dict[str, Any],
        ] = OrderedDict()
        self._lock = asyncio.Lock()

    @staticmethod
    def _identity(
        scope: dict[str, Any],
        headers: dict[str, str],
    ) -> str:
        authorization = headers.get("authorization", "")

        if authorization.lower().startswith("bearer "):
            token = authorization[7:].strip()
            user = decode_access_token(token)

            if user:
                return f"user:{int(user['id'])}"

            return "token:" + hashlib.sha256(
                token.encode("utf-8")
            ).hexdigest()

        init_data = headers.get("x-telegram-init-data", "")

        if init_data:
            user = verify_telegram_init_data(init_data)

            if user:
                return f"user:{int(user['id'])}"

            return "init:" + hashlib.sha256(
                init_data.encode("utf-8")
            ).hexdigest()

        client = scope.get("client")
        host = client[0] if client else "unknown"
        return f"ip:{host}"

    async def _purge(self, now: float) -> None:
        expired = [
            key
            for key, item in self._entries.items()
            if item["expires_at"] <= now
            and item.get("response") is not None
        ]

        for key in expired:
            self._entries.pop(key, None)

        while len(self._entries) > self.MAX_ENTRIES:
            oldest_key, oldest = next(
                iter(self._entries.items())
            )

            if oldest.get("response") is None:
                # Do not evict an in-flight request.
                self._entries.move_to_end(oldest_key)
                break

            self._entries.popitem(last=False)

    @staticmethod
    async def _replay(
        send,
        response: dict[str, Any],
    ) -> None:
        headers = [
            (name, value)
            for name, value in response["headers"]
            if name.lower() != b"idempotency-replayed"
        ]

        headers.append((
            b"idempotency-replayed",
            b"true",
        ))

        await send({
            "type": "http.response.start",
            "status": response["status"],
            "headers": headers,
        })

        await send({
            "type": "http.response.body",
            "body": response["body"],
            "more_body": False,
        })

    async def __call__(
        self,
        scope,
        receive,
        send,
    ):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET").upper()
        path = scope.get("path", "")

        if (
            method not in self.MUTATING_METHODS
            or not path.startswith("/api/")
            or path.startswith("/api/stream/")
            or path.startswith("/api/uploads/")
        ):
            await self.app(scope, receive, send)
            return

        headers = _headers(scope)
        idempotency_key = headers.get(
            "idempotency-key",
            "",
        ).strip()

        # Idempotency is opt-in so existing clients remain compatible.
        if not idempotency_key:
            await self.app(scope, receive, send)
            return

        if not self.KEY_PATTERN.fullmatch(idempotency_key):
            await _send_json(
                send,
                400,
                {
                    "ok": False,
                    "error": "invalid_idempotency_key",
                },
            )
            return

        try:
            content_length = int(
                headers.get("content-length", "0") or 0
            )
        except ValueError:
            content_length = 0

        if content_length > self.MAX_REQUEST_BODY:
            await _send_json(
                send,
                413,
                {
                    "ok": False,
                    "error": "idempotency_body_too_large",
                },
            )
            return

        body = bytearray()

        while True:
            message = await receive()

            if message["type"] == "http.disconnect":
                return

            if message["type"] != "http.request":
                continue

            body.extend(message.get("body", b""))

            if len(body) > self.MAX_REQUEST_BODY:
                await _send_json(
                    send,
                    413,
                    {
                        "ok": False,
                        "error": "idempotency_body_too_large",
                    },
                )
                return

            if not message.get("more_body", False):
                break

        raw_body = bytes(body)

        identity = self._identity(scope, headers)

        fingerprint_source = b"\n".join([
            method.encode("ascii"),
            path.encode("utf-8"),
            scope.get("query_string", b""),
            raw_body,
        ])

        fingerprint = hashlib.sha256(
            fingerprint_source
        ).hexdigest()

        cache_key = hashlib.sha256(
            f"{identity}:{method}:{path}:{idempotency_key}".encode(
                "utf-8"
            )
        ).hexdigest()

        now = time.monotonic()

        async with self._lock:
            await self._purge(now)

            existing = self._entries.get(cache_key)

            if existing:
                self._entries.move_to_end(cache_key)

                if existing["fingerprint"] != fingerprint:
                    await _send_json(
                        send,
                        409,
                        {
                            "ok": False,
                            "error": "idempotency_key_reused",
                        },
                    )
                    return

                cached_response = existing.get("response")
                future = existing["future"]

            else:
                future = asyncio.get_running_loop().create_future()

                self._entries[cache_key] = {
                    "fingerprint": fingerprint,
                    "expires_at": now + self.CACHE_TTL,
                    "response": None,
                    "future": future,
                }

                cached_response = None
                existing = None

        if existing:
            if cached_response is None:
                try:
                    cached_response = await asyncio.wait_for(
                        asyncio.shield(future),
                        timeout=self.WAIT_TIMEOUT,
                    )
                except asyncio.TimeoutError:
                    await _send_json(
                        send,
                        409,
                        {
                            "ok": False,
                            "error": "idempotent_request_in_progress",
                            "retry_after": 2,
                        },
                        headers=[
                            (b"retry-after", b"2"),
                        ],
                    )
                    return

            if cached_response is None:
                await _send_json(
                    send,
                    409,
                    {
                        "ok": False,
                        "error": "original_request_not_cached",
                    },
                )
                return

            await self._replay(send, cached_response)
            return

        delivered = False

        async def replay_receive():
            nonlocal delivered

            if not delivered:
                delivered = True

                return {
                    "type": "http.request",
                    "body": raw_body,
                    "more_body": False,
                }

            return await receive()

        response_messages: list[dict[str, Any]] = []

        async def capture_send(message):
            response_messages.append(message)

        try:
            await self.app(
                scope,
                replay_receive,
                capture_send,
            )

            start = next(
                (
                    item
                    for item in response_messages
                    if item["type"] == "http.response.start"
                ),
                None,
            )

            body_parts = [
                item.get("body", b"")
                for item in response_messages
                if item["type"] == "http.response.body"
            ]

            response_body = b"".join(body_parts)

            if start is None:
                raise RuntimeError(
                    "ASGI application returned without response start."
                )

            response = {
                "status": int(start["status"]),
                "headers": list(start.get("headers", [])),
                "body": response_body,
            }

            cacheable = (
                response["status"] < 500
                and len(response_body) <= self.MAX_RESPONSE_BODY
            )

            async with self._lock:
                item = self._entries.get(cache_key)

                if item:
                    if cacheable:
                        item["response"] = response
                        item["expires_at"] = (
                            time.monotonic() + self.CACHE_TTL
                        )
                        if not item["future"].done():
                            item["future"].set_result(response)
                    else:
                        self._entries.pop(cache_key, None)

                        if not item["future"].done():
                            item["future"].set_result(None)

            # Deliver the original response after the cache decision.
            for message in response_messages:
                await send(message)

        except BaseException:
            async with self._lock:
                item = self._entries.pop(cache_key, None)

                if item and not item["future"].done():
                    item["future"].set_result(None)

            raise
