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

    cors_origins: str = "http://localhost:3000"

    # Shared secret used to sign the identity forwarded from the web container.
    agent_service_token: str = "dev-insecure-change-me"

    deepseek_api_key: str | None = None
    deepseek_api_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-v4-flash"

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
