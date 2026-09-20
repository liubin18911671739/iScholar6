# syntax=docker/dockerfile:1

FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /eval
COPY pyproject.toml ./
COPY agent_eval ./agent_eval
RUN uv pip install --system --no-cache .
COPY . .

CMD ["python", "-m", "agent_eval.runner"]
