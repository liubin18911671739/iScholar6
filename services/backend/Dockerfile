# syntax=docker/dockerfile:1

FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /uvx /bin/
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
# Storage volume is initialized from this dir, so pre-own it for the app user.
RUN mkdir -p /data/storage && chown -R 10001:10001 /data
USER 10001:10001
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# Optional vectors worker (compose profile "vectors"): installs the heavy
# sentence-transformers/torch extra and backfills embeddings.
FROM base AS vectors
RUN uv pip install --system --no-cache torch --index-url https://download.pytorch.org/whl/cpu \
 && uv pip install --system --no-cache --index-url https://pypi.tuna.tsinghua.edu.cn/simple ".[vectors]" \
    && mkdir -p /data/storage && chown -R 10001:10001 /data
USER 10001:10001
CMD ["python", "-m", "app.vectors.worker"]
