# Repository Guidelines

iScholar v6.0 (`package.json` name `ischolar-v6`). **The repo is mid-rewrite.** The shipped app is still
Next.js 14 (App Router, strict TS) + Dexie/IndexedDB + Supabase, while `IMPLEMENTATION_PLAN.md` tracks the
migration to an all-in-Docker platform: Next.js BFF + Python FastAPI/LangGraph backend + Postgres/pgvector,
Auth.js instead of Supabase auth. Both stacks exist side by side—figure out which one owns the code you touch
before editing.

## Read before assuming architecture

- `IMPLEMENTATION_PLAN.md` holds the authoritative direction (locked decisions + stage list); `TODO.md` is the
  live execution log and is **more current** — it records **Stage 0 and Stage 1a complete** (Stage 1 still in
  progress: the frontend React Query data-layer migration remains), while the plan's stage checkboxes still
  trail. `README.md` / `TODO.md` / `doc/*` describe the **target** architecture.
- `CLAUDE.md` is the stale one—it still describes the **old** browser-local / opt-in-Supabase model (and
  `doc/database.md` has a legacy appendix). Trust executable config/code and the plan over prose.
- Legacy data layer: `lib/local/*` (Dexie) and `lib/supabase/*`. New platform: `services/backend`,
  `services/eval`, reached from the web via `lib/server/backend.ts` and `app/api/agent/[...path]/route.ts`.
- Two BFF proxies exist, both through `lib/server/backend-proxy.ts` (root allowlist: `agent`/`data`/`vectors`):
  `/api/agent/[...path]` and `/api/data/[...path]`. The UI still calls legacy routes, so most features do
  not reach the Python backend yet.

## Commands

pnpm is the real package manager (`pnpm-lock.yaml` is the only lockfile); don't add a package-lock.json.
There is **no CI workflow** in this repo (no `.github/`) — run `pnpm quality-gate` locally before shipping.
Node 22 required: **Node 20 crashes SSR with `Promise.withResolvers is not a function`** via pdfjs-dist.

```bash
pnpm dev / build / start / lint
pnpm vitest run [path]           # all unit/component tests once; single file by path
pnpm test:e2e                    # Playwright, auto-starts dev server on 3100
pnpm playwright test e2e/<file>  # single E2E
pnpm quality-gate                # lint -> vitest -> build -> e2e (currently fails on the e2e step, see below)
pnpm quality-gate:full           # + supabase schema/acceptance + real-Supabase E2E
pnpm exec tsc --noEmit           # no typecheck script; `pnpm build` also type-checks
```

Docker platform (new stack):
```bash
pnpm docker:up / docker:down     # full compose stack (web/backend/worker/postgres/redis/proxy)
pnpm agent:dev                   # backend hot-reload overlay; run web with `pnpm dev`
pnpm agent:test                  # docker compose run --rm backend pytest
pnpm agent:eval                  # eval profile (Stage 5 skeleton); `--profile vectors` for embeddings
docker compose config            # validate before changing compose
```
Backend directly (`services/backend`, Python 3.12, uv, ruff line-length 120): run `uv sync --extra dev`
first (the repo `.venv` lacks pytest/ruff), then `ruff check && pytest`.

## New platform (services/backend)

- FastAPI entrypoint `app/main.py`; routers in `app/api/v1`: `/v1/healthz`, `/v1/readyz`, `/v1/me`,
  `/v1/data/*` (research-core CRUD package), `/v1/agent`. Compose healthcheck hits `/v1/healthz`.
- Auth tables (`users`/`accounts`/`verification_token`) are web-owned and **not** mapped by the backend
  ORM. `owner_id` columns carry a DB-level FK to `users(id)` added by Alembic, but the models declare no
  FK — so never use `alembic revision --autogenerate` as the schema source; hand-write revisions.
  Read the caller's global role with `app/api/v1/deps.resolve_role`; policy lives in `app/core/authz.py`.
- **Identity is signed, never trusted raw.** The web BFF signs `X-IScholar-User`/`-Timestamp`/`-Signature`
  with HMAC-SHA256 over `AGENT_SERVICE_TOKEN`; backend rejects unsigned or ±300s-stale calls
  (`app/core/security.py`, mirrored by `lib/server/backend.ts`). Never forward an unsigned user id, and never
  expose `AGENT_SERVICE_TOKEN` / `BACKEND_INTERNAL_URL` to the browser.
- Schema changes go through Alembic (`services/backend/alembic/versions`); compose's `migrate` service runs
  `alembic upgrade head` before backend/worker start. Add a revision; don't edit applied ones.
- Graph nodes act through `AgentHarness` (`app/agents/harness.py`) for tool budgets, permissions, run events,
  and idempotent artifact writes—not direct domain writes.
- `/v1/data/*` serializes camelCase in and out (`to_camel` alias generator in `app/api/v1/data/common.py`) and
  returns **404** (not 403) for another user's row, even for staff. Match that convention in new routers.
- `services/eval` is a runnable skeleton until Stage 5.

## Legacy data and sync gotchas (still live)

- Auth.js (`lib/auth.ts`, credentials + Postgres `users`, handler at `app/api/auth/[...nextauth]/route.ts`)
  is the auth path. `middleware.ts` is Auth.js Edge middleware and must import the edge-safe
  `lib/auth.config.ts` (never `lib/auth.ts`, which pulls in `pg`/`bcryptjs` and breaks the Edge bundle);
  it gates `/dashboard|/projects|/settings|/tools|/training`, excluding `/api/*` and public pages.
  `lib/supabase/*` still powers the legacy collaborative data layer.
- `isCollaborativeMode()` (`lib/supabase/collaborative.ts`) reads
  `NEXT_PUBLIC_COLLABORATIVE_MODE === "true"`; when off, the legacy hooks/audit and agent routes use
  IndexedDB and `requireApiUser()` returns a local identity instead of a Supabase session.
- Dexie schema `lib/local/db.ts` is v4. Always add a **new** version for any schema change.
- Syncing a legacy table/field = the four steps documented atop `lib/supabase/field-map.ts`: SQL migration →
  `DEXIE_TO_REMOTE_TABLE`/`REMOTE_COLUMN_MAP` → `doc/database.md` → regression test in
  `__tests__/lib/supabase/field-map.test.ts`. Watch the `order` → `ordinal` special case.
- Legacy API routes (agents, MCP, hermes, training) share the guard chain in `lib/server/request-guards.ts`;
  external AI/MCP calls need a `consentProof` (with `consentId`) from `POST /api/ai/consents` or are rejected
  403. Don't claim data never leaves the device. Never prefix `SUPABASE_SERVICE_ROLE_KEY` with `NEXT_PUBLIC_`;
  never commit `.env.local`.

## Architecture notes

- `app/(app)/layout.tsx` switches layout via `isModuleRoute(pathname)`: agent/module routes are full-bleed
  (`components/module/`), everything else uses the sidebar + topbar shell.
- Agent pages are thin wrappers around `AgentPageTemplate`. Behavior lives in **two** places: the config
  object in `components/agents/agent-configs.tsx` and per-agent dir `components/agents/configs/<agent>/`.
- `components/module/stages.ts` accent classes are complete static Tailwind strings; keep them literal or JIT
  drops them.
- i18n: update **both** `messages/zh-CN.json` and `messages/en-US.json`—a missing key throws
  `MISSING_MESSAGE`. Use `t.raw("key")` for array/object values.
- Theme tokens in `app/globals.css` are space-separated HSL components (`216 98% 52%`); never wrap in `hsl()`
  or use hex. There is one dark theme.
- `pnpm-workspace.yaml` is not a real workspace—it only lists `ignoredBuiltDependencies` (native build
  scripts are skipped for `sharp`, `onnxruntime-node`, `@swc/core`, etc.). `package.json` pins
  `packageManager: pnpm@10.31.0`; a newer pnpm (corepack default in Docker) rejects the old `allowBuilds`
  key with `ERR_PNPM_IGNORED_BUILDS`, so keep the pin and the `ignoredBuiltDependencies` key.
- `app/modules/*` are legacy redirects to `/projects`; don't add features there. The plugin system is
  local-only (not synced).

## Testing quirks

- `vitest.setup.ts` replaces `crypto.subtle.digest` with a deterministic non-crypto hash (stable across runs);
  its `crypto.randomUUID` fallback is still random — don't assert exact UUIDs.
- E2E authenticates through Auth.js credentials. `e2e/global-setup.ts` seeds staff/learner users into
  Postgres and `playwright.config.ts` injects a host-reachable `AUTH_DATABASE_URL` (the compose `.env`
  points at the docker-internal `postgres` host). Start Postgres first: `docker compose up -d --wait postgres`.
  `pnpm test:e2e` runs 51 tests (the Supabase-only training-camp spec is skipped unless `REAL_SUPABASE_E2E=true`).
- Playwright deliberately uses port 3100, `reuseExistingServer: false`, and `workers: 1` to avoid
  IndexedDB/dialog races—don't "optimize" this to parallel.
- `e2e/supabase-collaboration.spec.ts` runs only with `REAL_SUPABASE_E2E=true` plus real Supabase credentials.
- `tsconfig.json` type-checks `app/`, `components/`, `lib/`, `types/**/*.d.ts`, `middleware.ts` and
  `next-env.d.ts`—**not** `__tests__/` or `e2e/` (a test-only type error passes `tsc`). `pyrightconfig.json`
  covers the Python services.

## Conventions

Two-space indent, kebab-case filenames, PascalCase components, camelCase vars, `UPPER_SNAKE_CASE` constants,
`@/` imports, Tailwind + existing shadcn/Radix primitives. Conventional-commit subjects (`feat:`, `fix:`,
`refactor:`, `docs:`, `chore:`; scopes like `fix(e2e):`). Add focused tests under `__tests__/` (or
`services/*/tests` for Python); run the narrowest file first.
