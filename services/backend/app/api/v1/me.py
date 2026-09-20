"""Identity endpoint used by the web BFF to validate service-token forwarding."""

from fastapi import APIRouter, Depends

from app.core.security import Identity, require_identity

router = APIRouter()


@router.get("")
async def read_me(identity: Identity = Depends(require_identity)) -> dict[str, object]:
    """Return the verified caller identity."""
    return {"ok": True, "data": {"userId": identity.user_id}}
