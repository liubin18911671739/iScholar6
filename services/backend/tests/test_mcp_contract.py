"""MCP registry + server + REST contract tests (no network)."""

import pytest

from app.api.v1.mcp import ToolInvoke
from app.main import app
from app.mcp.registry import MCPTool, registry
from app.mcp.server import build_mcp_server


def test_builtin_registry_surface() -> None:
    names = registry.names()
    assert {
        "scholar.search",
        "openalex_search",
        "crossref_lookup",
        "semantic_scholar",
        "journal_finder",
        "ischolar.list_projects",
        "ischolar.search_bibliography",
        "ischolar.manuscript_outline",
    } <= names
    tool = registry.get("scholar.search")
    assert tool is not None and tool.source == "builtin"


def test_plugin_cannot_overwrite_builtin() -> None:
    from pydantic import BaseModel

    class P(BaseModel):
        pass

    async def handler(_: object) -> None:
        return None

    with pytest.raises(ValueError, match="built-in"):
        registry.register(MCPTool("scholar.search", "shadow", P, handler, source="plugin"))


def test_params_validation_aliases() -> None:
    from app.mcp.tools.scholar import OpenAlexSearchParams

    params = OpenAlexSearchParams.model_validate({"query": "ai", "perPage": 5, "yearFrom": 2020})
    assert params.per_page == 5
    assert params.year_from == 2020
    assert OpenAlexSearchParams.model_validate({"query": "ai", "per_page": 3}).per_page == 3


@pytest.mark.asyncio
async def test_mcp_server_lists_builtin_tools() -> None:
    server = build_mcp_server()
    tools = await server.list_tools()
    names = {tool.name for tool in tools}
    assert {
        "scholar.search",
        "openalex_search",
        "crossref_lookup",
        "semantic_scholar",
        "journal_finder",
        "ischolar.list_projects",
        "ischolar.search_bibliography",
        "ischolar.manuscript_outline",
    } <= names


def test_tool_invoke_model_aliases() -> None:
    import uuid

    body = ToolInvoke.model_validate(
        {
            "projectId": str(uuid.uuid4()),
            "consentProof": {"consentId": str(uuid.uuid4())},
            "params": {"query": "ai"},
        }
    )
    assert body.params == {"query": "ai"}


def test_ischolar_params_aliases() -> None:
    import uuid

    from app.mcp.tools.ischolar import ListProjectsParams, SearchBibliographyParams

    assert ListProjectsParams.model_validate({"ownerId": str(uuid.uuid4())}).owner_id is not None
    params = SearchBibliographyParams.model_validate({"projectId": str(uuid.uuid4()), "query": "ai", "limit": 3})
    assert params.limit == 3


def test_mcp_bearer_middleware() -> None:
    from starlette.applications import Starlette
    from starlette.responses import JSONResponse
    from starlette.routing import Route
    from starlette.testclient import TestClient

    from app.mcp.server import BearerAuthMiddleware

    async def ok(_request: object) -> JSONResponse:
        return JSONResponse({"ok": True})

    app = Starlette(routes=[Route("/", ok)])
    app.add_middleware(BearerAuthMiddleware, token="secret")
    client = TestClient(app)
    assert client.get("/").status_code == 401
    assert client.get("/", headers={"authorization": "Bearer secret"}).status_code == 200


def test_mcp_route_inventory() -> None:
    paths = set(app.openapi()["paths"].keys())
    assert {"/v1/mcp/tools", "/v1/mcp/tools/{name}"} <= paths
