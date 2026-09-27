"""Plugin install + prompt-pack contracts (no database)."""

from app.api.v1.plugins import PluginInstallBody, PromptPackBody
from app.main import app


def test_plugin_install_body_aliases() -> None:
    body = PluginInstallBody.model_validate(
        {"id": "open-library-tools", "version": "1.0.0", "enabled": True, "contentHash": "abc", "manifest": {}}
    )
    assert body.content_hash == "abc"
    assert body.enabled is True


def test_prompt_pack_body() -> None:
    assert PromptPackBody.model_validate({"packRef": "plugin/ethics"}).pack_ref == "plugin/ethics"


def test_plugins_route_inventory() -> None:
    paths = set(app.openapi()["paths"].keys())
    assert {
        "/v1/plugins",
        "/v1/plugins/{plugin_id}",
        "/v1/plugins/prompt-packs",
        "/v1/plugins/prompt-packs/{agent_id}",
    } <= paths
