# syntax=docker/dockerfile:1

FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
COPY pyproject.toml ./
COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
RUN uv pip install --system --no-cache .
COPY . .

FROM base AS dev
RUN uv pip install --system --no-cache ".[dev]"
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base AS prod
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# Optional vectors worker (compose profile "vectors"): installs the heavy
# sentence-transformers/torch extra and backfills embeddings.
FROM base AS vectors
RUN uv pip install --system --no-cache ".[vectors]"
CMD ["python", "-m", "app.vectors.worker"]
