# Repository Guidelines

iScholar v6.0 (`package.json` name `ischolar-v6`). The app is a Next.js 14 App Router (strict TS) thin BFF in
front of an all-in-Docker platform: Python FastAPI/LangGraph backend + Postgres/pgvector, with Auth.js
(credentials + Postgres `users`) as the auth path. **The legacy Dexie/IndexedDB + Supabase data layer has been
removed** (`lib/local/*`, `lib/supabase/*`, `@supabase/*`, `dexie`, `@huggingface/transformers` are gone) — the
client now talks only to the backend through the signed BFF.

## Read before assuming architecture

- `IMPLEMENTATION_PLAN.md` holds the locked direction; `TODO.md` is the live execution log and is **more
  current** — verify against code, not the plan. `CLAUDE.md` is stale (describes the old browser-local stack).
- Web data layer: typed clients in `lib/client/*` (`data.ts`, `training.ts`, `agents.ts`, `audit.ts`,
  `plugins.ts`, `http.ts`) plus React Query hooks in `lib/client/hooks/*`. The public import surface is
  `@/lib/hooks`, which just re-exports `@/lib/client/hooks` (there is **no** runtime data-backend switch left).
- BFF proxies route through `lib/server/backend-proxy.ts` with a root allowlist of
  `agent`/`audit`/`data`/`realtime`/`vectors`/`training`/`mcp`/`plugins`. The `[...path]` proxies wired are
  `agent`, `audit`, `data`, `plugins`, `realtime`, `training`, `vectors`. `/api/mcp/[tool]` is a separate
  adapter (calls `backendIdentityHeaders` directly, not `proxyToBackend`). Training has no per-endpoint routes —
  only `app/api/training/[...path]`. `/api/invites` and `/api/invites/accept` are web-owned (nothing under
  `/v1`).
- **Identity is signed, never trusted raw.** The web BFF signs `X-IScholar-User`/`-Timestamp`/`-Signature`
  with HMAC-SHA256 over `AGENT_SERVICE_TOKEN`; the backend rejects unsigned or ±300s-stale calls
  (`app/core/security.py`, mirrored by `lib/server/backend.ts`, which resolves the Auth.js session only).
  Never forward an unsigned user id, and never expose `AGENT_SERVICE_TOKEN` / `BACKEND_INTERNAL_URL` to the browser.

## Commands

pnpm is the real package manager (`pnpm-lock.yaml` is the only lockfile); don't add a package-lock.json.
There is **no CI workflow** (no `.github/`) — run `pnpm quality-gate` locally before shipping. Node 22
required: **Node 20 crashes SSR with `Promise.withResolvers is not a function`** via pdfjs-dist.

```bash
pnpm dev / build / start / lint
pnpm vitest run [path]           # all unit/component tests once; single file by path
pnpm test:e2e                    # Playwright, auto-starts dev server on 3100
pnpm playwright test e2e/<file>  # single E2E
pnpm quality-gate                # lint -> vitest -> build -> e2e (best-effort starts compose Postgres first)
pnpm exec tsc --noEmit           # no typecheck script; `pnpm build` also type-checks
```

Docker platform (new stack):
```bash
pnpm docker:up / docker:down     # full compose stack (web/backend/worker/postgres/redis/proxy)
pnpm agent:dev                   # backend hot-reload overlay; run web with `pnpm dev`
pnpm agent:test                  # pytest via the `dev` compose overlay (prod image has no pytest)
pnpm agent:eval                  # compose `eval` profile: offline datasets/checks + threshold report
docker compose config            # validate before changing compose
```

Backend directly (`services/backend`, Python 3.12, uv, ruff line-length 120; `uv.lock` is committed): run
`uv sync --extra dev`, then `uv run ruff check && uv run pytest` (same for `services/eval`). The repo has no
`.venv` checked in — create it with uv.

## New platform (services/backend)

- FastAPI entrypoint `app/main.py`; routers in `app/api/v1`: `/v1/healthz`, `/v1/readyz`, `/v1/me`,
  `/v1/data/*` (research-core CRUD), `/v1/agent` (durable runs + graphs), `/v1/training`, `/v1/mcp`,
  `/v1/vectors`, `/v1/audit` (consents + SHA-256 chain), `/v1/realtime`, `/v1/plugins`. Compose healthcheck
  hits `/v1/healthz`.
- Beyond routers: `app/agents/graphs/*` builds one LangGraph per agent (+ Hermes, `training.py` for `coach`,
  `plugin.py` for `p.<plugin>.<key>`); `app/mcp/*` is the tool registry + FastMCP server + client pool;
  `app/training/*` holds pure logic ports (incl. `reporting_v2.py`, `lms_gradebook.py`). Declarative plugin MCP
  tools are **not** registered (the `plugin_mcp_tools` table was dropped in migration `0012`). Run-time consent
  is configurable via `AGENT_REQUIRE_CONSENT`.
- Auth tables (`users`/`accounts`/`verification_token`) are web-owned and **not** mapped by the backend ORM.
  `owner_id` columns carry a DB-level FK to `users(id)` added by Alembic, but the models declare no FK — so
  never use `alembic revision --autogenerate` as the schema source; hand-write revisions. Read the caller's
  global role with `app/api/v1/deps.resolve_role`; policy lives in `app/core/authz.py`.
- Schema changes go through Alembic (`services/backend/alembic/versions`; 12 revisions, single head
  `20260929_0012`); compose's `migrate` service runs `alembic upgrade head` before backend/worker start. Add a
  revision; don't edit applied ones.
- Graph nodes act through `AgentHarness` (`app/agents/harness.py`) for tool budgets, permissions, run events,
  and idempotent artifact writes—not direct domain writes.
- `/v1/data/*` serializes camelCase in and out (`to_camel` alias generator in `app/api/v1/data/common.py`) and
  returns **404** (not 403) for another user's row, even for staff. Match that convention in new routers.
- PII gate: `app/privacy/sensitive_content.py` mirrors the web regexes; `/v1/training/me` submit and evidence
  create/update reject with `400 SENSITIVE_CONTENT`. Consent `sensitive_scan` remains client-computed counts.
  `lib/client/http.ts` normalizes FastAPI's `{detail: "<CODE>"}` into the error code so components can match it.
- `services/eval` runs offline: datasets + deterministic checks + threshold JSON report; `EVAL_MODE=live`
  drives the backend runtime and `EVAL_JUDGE` adds an optional LLM judge.

## Client data layer

- `lib/client/http.ts` unwraps the `{ok,data}` envelope (`request`), returns the full payload
  (`requestEnvelope`, for `me`/`reviews`/`verify`), or a raw stream (`requestRaw`, CSV exports).
- `lib/client/training.ts` is the typed training client (invite, evidence, programs, tasks, reviews, LMS…).
  `lib/client/hooks/training.ts` exposes only the reads that need reactivity; mutations are called directly.
- After a mutation, invalidate with `invalidateTrainingQueries()` (training) or the relevant `qk.*` key.
- Coach evidence cards now use `POST /v1/training/submissions/{id}/evidence` and
  `PATCH /v1/training/evidence/{id}` (backend).
- Agent runs come from `lib/client/agents.ts` (`listRuns`), mapped to the legacy `LocalAgentRun` shape by
  `lib/client/hooks/agent-runs.ts` for output panels/stepper; cost is derived from token usage in `cost.ts`.

## Architecture notes

- `app/(app)/layout.tsx` switches layout via `isModuleRoute(pathname)`: agent/module routes are full-bleed
  (`components/module/`), everything else uses the sidebar + topbar shell.
- Agent pages are thin wrappers around `AgentPageTemplate`; `components/agents/agent-configs.tsx` is just a
  barrel. Behavior lives in `components/agents/configs/<agent>/` (config + inputs + module content) and the
  registry in `components/agents/`.
- `components/module/stages.ts` accent classes are complete static Tailwind strings; keep them literal or JIT
  drops them.
- i18n: update **both** `messages/zh-CN.json` and `messages/en-US.json`—a missing key throws
  `MISSING_MESSAGE`. Use `t.raw("key")` for array/object values.
- Theme tokens in `app/globals.css` are space-separated HSL components (`216 98% 52%`); never wrap in `hsl()`
  or use hex. There is one dark theme.
- `pnpm-workspace.yaml` is not a real workspace—it only lists `ignoredBuiltDependencies` (native build
  scripts are skipped for `sharp`, `onnxruntime-core`, `@swc/core`, etc.). `package.json` pins
  `packageManager: pnpm@10.31.0`; a newer pnpm (corepack default in Docker) rejects the old `allowBuilds`
  key with `ERR_PNPM_IGNORED_BUILDS`, so keep the pin and the `ignoredBuiltDependencies` key.
- `app/modules/*` (only `rebuttal-show` remains) are legacy redirects to `/projects`; don't add features there.
  Per-user plugin installs/prompt packs persist in the backend `/v1/plugins`.
- Training invites are web-side: `POST /api/invites` resolves/creates a web-owned `users` row and emails a
  signed accept link (`lib/server/{invite,invite-token,smtp}.ts`; accept at `/(auth)/accept-invite`). SMTP is
  configured via `SMTP_*`; with no SMTP the user is still created but no mail is sent. No `nodemailer`
  dependency — the client is hand-rolled in `lib/server/smtp.ts`.
- Audit entries are written to the backend (`/v1/audit`) and read via `lib/client/hooks/audit.ts`.

## Testing quirks

- `vitest.setup.ts` replaces `crypto.subtle.digest` with a deterministic non-crypto hash (stable across runs);
  its `crypto.randomUUID` fallback is still random — don't assert exact UUIDs. It also sets `ALLOW_LOCAL_API`.
- E2E authenticates through Auth.js credentials. `e2e/global-setup.ts` seeds staff/learner users into
  Postgres and `playwright.config.ts` injects a host-reachable `AUTH_DATABASE_URL` (the compose `.env` points
  at the docker-internal `postgres` host). Start Postgres first: `docker compose up -d --wait postgres`.
  Training/agent flows now need the backend reachable (`BACKEND_INTERNAL_URL`).
- Playwright deliberately uses port 3100, `reuseExistingServer: false`, and `workers: 1` to avoid
  IndexedDB/dialog races—don't "optimize" this to parallel.
- `tsconfig.json` type-checks `app/`, `components/`, `lib/`, `types/**/*.d.ts`, `middleware.ts` and
  `next-env.d.ts`—**not** `__tests__/` or `e2e/` (a test-only type error passes `tsc`). `pyrightconfig.json`
  covers the Python services.

## Conventions

Two-space indent, kebab-case filenames, PascalCase components, camelCase vars, `UPPER_SNAKE_CASE` constants,
`@/` imports, Tailwind + existing shadcn/Radix primitives. Conventional-commit subjects (`feat:`, `fix:`,
`refactor:`, `docs:`, `chore:`; scopes like `fix(e2e):`). Add focused tests under `__tests__/` (or
`services/*/tests` for Python); run the narrowest file first.
