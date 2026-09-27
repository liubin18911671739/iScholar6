"""Application settings loaded from the environment."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Values come from env vars (see compose `.env`)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "ischolar-backend"
    environment: str = "development"

    database_url: str = "postgresql+asyncpg://ischolar:ischolar@localhost:5432/ischolar"
    redis_url: str = "redis://localhost:6379/0"

    # Filesystem volume for attachment/script blobs (see compose `storage` volume).
    storage_dir: str = "/data/storage"

    cors_origins: str = "http://localhost:3000"

    # Shared secret used to sign the identity forwarded from the web container.
    agent_service_token: str = "dev-insecure-change-me"

    deepseek_api_key: str | None = None
    deepseek_api_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-v4-flash"

    # Agent runtime: `langgraph` runs the per-agent graphs; `legacy` proxies the
    # old web route. `agent_model_fake` forces the deterministic model for tests.
    agent_runtime: str = "langgraph"
    agent_model_fake: bool = False
    # When true, creating a run requires an `ai_consents_v2` row with services.
    # Default off: the web BFF verifies consent before forwarding (migration period).
    agent_require_consent: bool = False

    # MCP: built-in tools run in-process; `mcp_servers` is a JSON list of
    # {"name": str, "url": str} streamable-HTTP endpoints for the client pool.
    mcp_enabled: bool = True
    mcp_servers: str = "[]"
    mcp_request_max_bytes: int = 2 * 1024 * 1024
    mcp_response_max_bytes: int = 2 * 1024 * 1024
    mcp_server_token: str | None = None

    @property
    def mcp_server_list(self) -> list[dict[str, str]]:
        import json

        try:
            parsed = json.loads(self.mcp_servers)
        except ValueError:
            return []
        if not isinstance(parsed, list):
            return []
        return [
            {"name": str(entry.get("name", "")), "url": str(entry.get("url", ""))}
            for entry in parsed
            if isinstance(entry, dict) and entry.get("url")
        ]

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings singleton."""
    return Settings()
