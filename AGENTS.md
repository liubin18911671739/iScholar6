# Repository Guidelines

iScholar v6.0 (`package.json` name `ischolar-v6`). **The repo is mid-rewrite.** The shipped app is still
Next.js 14 (App Router, strict TS) + Dexie/IndexedDB + Supabase, while `IMPLEMENTATION_PLAN.md` tracks the
migration to an all-in-Docker platform: Next.js BFF + Python FastAPI/LangGraph backend + Postgres/pgvector,
Auth.js instead of Supabase auth. Both stacks exist side by side—figure out which one owns the code you touch
before editing.

## Read before assuming architecture

- `IMPLEMENTATION_PLAN.md` holds the authoritative direction (locked decisions + stage list); `TODO.md` is the
  live execution log and is **more current** — per `TODO.md`, Stage 0 and the 1a/1b/1c backends are done, and
  Stages 2-6 have working backend slices (agent graphs, MCP, eval, plugins) while the plan's checkboxes trail.
  Verify against code, not the plan.
- **Every new-stack front sits behind a switch**: `NEXT_PUBLIC_DATA_BACKEND` (`legacy` default) for the
  research data layer and `AGENT_RUNTIME` (code fallback `legacy`, but `.env.example` ships `langgraph`) for
  agent calls. So the shipped UI still runs the old Dexie/Supabase/DeepSeek paths even though the backend exists.
- `CLAUDE.md` is the stale one—it still describes the **old** browser-local / opt-in-Supabase model (and
  `doc/database.md` has a legacy appendix). Trust executable config/code and `TODO.md` over prose.
- Legacy data layer: `lib/local/*` (Dexie) and `lib/supabase/*`. New platform: `services/backend`,
  `services/eval`, reached from the web via `lib/server/backend.ts`. New-stack research hooks live in
  `lib/client/hooks/*` + `lib/client/data.ts` (React Query over `/api/data`); the `NEXT_PUBLIC_DATA_BACKEND`
  switch is inline in `lib/local/hooks.ts`.
- BFF proxies route through `lib/server/backend-proxy.ts` with a root allowlist of
  `agent`/`audit`/`data`/`realtime`/`vectors`/`training`/`mcp`/`plugins`. The `[...path]` proxies actually wired
  are `agent`, `data`, `vectors`, `audit`, `realtime`, `plugins`. `/api/mcp/[tool]` is a separate adapter that
  reshapes the legacy flat body into the backend contract (calls `backendIdentityHeaders` directly, not
  `proxyToBackend`). The 24 `app/api/training/**` routes plus `/api/agent-runs` and `/api/hermes/chat` are
  **still legacy Supabase/DeepSeek**, not proxies.

## Commands

pnpm is the real package manager (`pnpm-lock.yaml` is the only lockfile); don't add a package-lock.json.
There is **no CI workflow** in this repo (no `.github/`) — run `pnpm quality-gate` locally before shipping.
Node 22 required: **Node 20 crashes SSR with `Promise.withResolvers is not a function`** via pdfjs-dist.

```bash
pnpm dev / build / start / lint
pnpm vitest run [path]           # all unit/component tests once; single file by path
pnpm test:e2e                    # Playwright, auto-starts dev server on 3100
pnpm playwright test e2e/<file>  # single E2E
pnpm quality-gate                # lint -> vitest -> build -> e2e (green; best-effort starts compose Postgres first)
pnpm quality-gate:full           # + supabase schema/acceptance + real-Supabase E2E
pnpm exec tsc --noEmit           # no typecheck script; `pnpm build` also type-checks
```

Docker platform (new stack):
```bash
pnpm docker:up / docker:down     # full compose stack (web/backend/worker/postgres/redis/proxy)
pnpm agent:dev                   # backend hot-reload overlay; run web with `pnpm dev`
pnpm agent:test                  # docker compose run --rm backend pytest
pnpm agent:eval                  # compose `eval` profile: offline datasets/checks + threshold report
docker compose config            # validate before changing compose
```
Backend directly (`services/backend`, Python 3.12, uv, ruff line-length 120): run `uv sync --extra dev`
first (the repo `.venv` lacks pytest/ruff), then `ruff check && pytest`.

## New platform (services/backend)

- FastAPI entrypoint `app/main.py`; routers in `app/api/v1`: `/v1/healthz`, `/v1/readyz`, `/v1/me`,
  `/v1/data/*` (research-core CRUD), `/v1/agent` (durable runs + graphs), `/v1/training`, `/v1/mcp`,
  `/v1/vectors`, `/v1/audit` (consents + SHA-256 chain), `/v1/realtime`, `/v1/plugins`. Compose healthcheck
  hits `/v1/healthz`.
- Beyond routers: `app/agents/graphs/*` builds one LangGraph per agent (+ Hermes); `app/mcp/*` is the tool
  registry + FastMCP server + client pool; `app/training/*` holds pure logic ports; `app/models/plugins.py`
  persists per-user plugin installs. Run-time consent is configurable via `AGENT_REQUIRE_CONSENT`.
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
- `services/eval` runs offline: datasets + deterministic checks + threshold JSON report; `EVAL_MODE=live`
  drives the backend runtime and `EVAL_JUDGE` adds an optional LLM judge.
- `AGENT_RUNTIME=langgraph` routes `/api/agents/[agent]` through `lib/server/agent-runtime.ts`, which creates a
  backend thread + run, polls `/v1/agent/runs/{id}`, and streams artifact text plus a `__USAGE__` trailer —
  **not** SSE, despite the legacy path's SSE contract.

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
- Legacy API routes (agents, hermes, training, `/api/agent-runs`) share the guard chain in
  `lib/server/request-guards.ts`. Since the auth hardening, `requireApiUser` requires a real Auth.js session;
  the only bypass is the explicit `ALLOW_LOCAL_API=true` env (dev/tests only, never production). External
  AI/MCP calls need a `consentProof` (`consentId`); the old `POST /api/ai/consents` route is gone — consents
  are created via `POST /api/audit/consents` and verified against backend `ai_consents_v2`
  (`GET /v1/audit/consents/{id}`), **fail-closed** (`verifyConsent`/`verifyProgramConsent` in
  `lib/server/request-guards.ts`). Training-submit consent is program-scoped and may omit `project_id`.
  Don't claim data never leaves the device. Never prefix `SUPABASE_SERVICE_ROLE_KEY` with `NEXT_PUBLIC_`;
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
- `app/modules/*` are legacy redirects to `/projects`; don't add features there. Legacy plugin definitions
  (`lib/plugins/*`) are local-only; per-user installs/prompt packs now persist in the backend `/v1/plugins`.

## Testing quirks

- `vitest.setup.ts` replaces `crypto.subtle.digest` with a deterministic non-crypto hash (stable across runs);
  its `crypto.randomUUID` fallback is still random — don't assert exact UUIDs.
- E2E authenticates through Auth.js credentials. `e2e/global-setup.ts` seeds staff/learner users into
  Postgres and `playwright.config.ts` injects a host-reachable `AUTH_DATABASE_URL` (the compose `.env`
  points at the docker-internal `postgres` host). Start Postgres first: `docker compose up -d --wait postgres`.
  `pnpm test:e2e` runs 51 pass / 1 skip: the collaborative test in `training-camp.spec.ts` self-skips unless
  `REAL_SUPABASE_E2E=true` (the whole `supabase-collaboration.spec.ts` is `testIgnore`d).
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
