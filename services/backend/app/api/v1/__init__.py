"""Version 1 API router."""

from fastapi import APIRouter

from app.api.v1 import agent, data, health, me, vectors

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(me.router, prefix="/me", tags=["identity"])
api_router.include_router(data.router)
api_router.include_router(vectors.router)
api_router.include_router(agent.router)
