"""Application settings loaded from the environment."""

from functools import lru_cache

from pydantic import model_validator
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
    # The desktop access-token key is derived from it (see core/security.py),
    # so production's placeholder guard below also covers desktop tokens.
    agent_service_token: str = "dev-insecure-change-me"

    # Desktop client password login: lifetime of the issued bearer access token.
    desktop_token_ttl_seconds: int = 12 * 60 * 60

    deepseek_api_key: str | None = None
    deepseek_api_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-v4-flash"

    # `agent_model_fake` forces the deterministic model for tests.
    agent_model_fake: bool = False
    # When true, creating a run requires an `ai_consents_v2` row with services.
    # Default off: the web BFF verifies consent before forwarding (migration period).
    agent_require_consent: bool = False
    # Model call parameters (ChatOpenAI). Per-agent overrides can be added on
    # top of these defaults later without changing graph code.
    model_temperature: float = 0.3
    model_timeout_seconds: float = 120.0
    model_max_retries: int = 2
    # Per-run model token budget (best effort, per worker attempt). 0 disables.
    agent_max_tokens_per_run: int = 400_000

    # Worker lease: how long a claim stays valid, how often the worker extends
    # it, when the reaper scans for expired leases, and how many times a run
    # may be re-queued after a worker crash before it is marked failed.
    agent_lease_seconds: int = 300
    agent_heartbeat_seconds: int = 60
    agent_reap_interval_seconds: int = 15
    agent_max_attempts: int = 3

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

    @model_validator(mode="after")
    def _reject_insecure_defaults(self) -> "Settings":
        """Fail fast when production boots with shipped placeholder secrets."""
        if self.is_production and self.agent_service_token == "dev-insecure-change-me":
            raise ValueError("AGENT_SERVICE_TOKEN must be set to a non-default value in production")
        # Never serve deterministic placeholder output in production: without a
        # key the model would silently fall back to FakeModel.
        if self.is_production and not self.agent_model_fake and not self.deepseek_api_key:
            raise ValueError("DEEPSEEK_API_KEY must be set in production unless AGENT_MODEL_FAKE=true")
        return self


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings singleton."""
    return Settings()
