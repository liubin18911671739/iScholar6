"""FastAPI application entrypoint for the iScholar backend."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.api.v1 import api_router
from app.core.config import get_settings
from app.core.db import engine
from app.models import Project  # noqa: F401 - imports models before Alembic/autogeneration

settings = get_settings()


class MaxBodySizeMiddleware:
    """Cap the request body for matching path prefixes before it is buffered.

    FastAPI parses the body before the handler runs, so a handler-level
    Content-Length check cannot stop a chunked/undeclared oversized upload.
    This buffers up to `max_bytes` and short-circuits with a 413.
    """

    def __init__(self, app: ASGIApp, max_bytes: int, path_prefix: str) -> None:
        self.app = app
        self.max_bytes = max_bytes
        self.path_prefix = path_prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope.get("path", "").startswith(self.path_prefix):
            await self.app(scope, receive, send)
            return

        messages: list[Message] = []
        total = 0
        while True:
            message = await receive()
            messages.append(message)
            if message["type"] != "http.request":
                break
            total += len(message.get("body", b""))
            if total > self.max_bytes:
                await JSONResponse({"ok": False, "error": "REQUEST_TOO_LARGE"}, status_code=413)(
                    scope, receive, send
                )
                return
            if not message.get("more_body", False):
                break

        index = 0

        async def replay() -> Message:
            nonlocal index
            if index < len(messages):
                message = messages[index]
                index += 1
                return message
            return {"type": "http.request", "body": b"", "more_body": False}

        await self.app(scope, replay, send)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Dispose the database engine cleanly on shutdown."""
    yield
    await engine.dispose()


app = FastAPI(
    title="iScholar Backend",
    version="0.1.0",
    description="Domain data API + LangGraph agent runtime + MCP for iScholar.",
    lifespan=lifespan,
    # Do not expose interactive API docs in production.
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    MaxBodySizeMiddleware,
    max_bytes=settings.mcp_request_max_bytes,
    path_prefix="/v1/mcp",
)

app.include_router(api_router, prefix="/v1")
