"""Settings fail-fast contracts (offline, no database)."""

from __future__ import annotations

import pytest

from app.core.config import Settings


def test_production_requires_real_service_token() -> None:
    with pytest.raises(ValueError, match="AGENT_SERVICE_TOKEN"):
        Settings(environment="production", agent_service_token="dev-insecure-change-me")


def test_production_requires_model_key_or_fake_mode() -> None:
    with pytest.raises(ValueError, match="DEEPSEEK_API_KEY"):
        Settings(
            environment="production",
            agent_service_token="real-token",
            agent_model_fake=False,
            deepseek_api_key=None,
        )


def test_development_allows_missing_model_key() -> None:
    settings = Settings(
        environment="development",
        agent_service_token="dev-insecure-change-me",
        agent_model_fake=False,
        deepseek_api_key=None,
    )
    assert not settings.is_production


def test_production_with_model_key_or_fake_mode_boots() -> None:
    keyed = Settings(
        environment="production", agent_service_token="real-token", deepseek_api_key="sk-real"
    )
    assert keyed.is_production
    faked = Settings(
        environment="production",
        agent_service_token="real-token",
        agent_model_fake=True,
        deepseek_api_key=None,
    )
    assert faked.agent_model_fake is True
