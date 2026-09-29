"""Version 1 API router."""

from fastapi import APIRouter

from app.api.v1 import agent, audit, data, health, mcp, me, plugins, realtime, training, vectors

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(me.router, prefix="/me", tags=["identity"])
api_router.include_router(data.router)
api_router.include_router(training.router)
api_router.include_router(plugins.router)
api_router.include_router(vectors.router)
api_router.include_router(agent.router)
api_router.include_router(mcp.router)
api_router.include_router(audit.router)
api_router.include_router(realtime.router)
