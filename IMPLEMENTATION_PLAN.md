# IMPLEMENTATION_PLAN.md — Platform Rewrite (Docker · Postgres · Python · LangGraph · MCP)

> Status legend: 🔴 Not started | 🟡 In progress | 🟢 Complete
> Direction: replace Supabase + Dexie/IndexedDB + single-turn DeepSeek proxy with an
> all-in-Docker platform where a Python backend owns all data and runs real LangGraph agents.

## Locked decisions

| Topic | Decision |
| --- | --- |
| Agent runtime | Python LangGraph service |
| Harness | Execution harness **and** evaluation harness |
| MCP | Real MCP client + server |
| Rollout | Phased, core runtime first |
| Deployment | All-in Docker (no Vercel) |
| Data layer | Plain Postgres; remove Supabase entirely |
| Auth | Auth.js (NextAuth) + Postgres |
| Auth DB access | Auth.js adapter connects directly to **auth tables only**; Python owns all domain tables |
| Domain DB access | Python backend (single service) |
| Dexie | Remove completely |
| Vector search | pgvector + server-side embeddings |
| Plugins | Postgres, per-user |
| Model | `deepseek-v4-flash` (fallback `deepseek-chat`) |
| Existing data | Fresh start unless an ETL is requested |

## Target topology

```
Browser ── React Query ──► web (Next.js + Auth.js, thin BFF)
                             │ X-IScholar-User + HMAC service signature
                             ▼
                    backend (Python FastAPI, single image)
                      ├ /v1/data    all domain CRUD + authorization
                      ├ /v1/agent   LangGraph graphs + harness + checkpointer
                      ├ /v1/mcp     MCP client pool + MCP server endpoint
                      ├ /v1/audit   SHA-256 audit chain
                      ├ /v1/vectors pgvector search + embeddings
                      └ Postgres (pgvector) ── DeepSeek via langchain-openai bind_tools
compose: web · backend · postgres(pgvector) · redis · proxy · eval(profile)
```

## Stages

### Stage 0 — Docker + Postgres + Auth 🟡
**Goal**: runnable container platform with auth foundation.
**Deliverables**: `docker-compose.yml` / `.dev.yml`; `docker/web.Dockerfile`; `proxy/Caddyfile`;
`services/backend` skeleton (FastAPI, config, async DB, service-token security, `/healthz`, `/readyz`, `/v1/me`);
`db/init` extensions + auth users; Alembic scaffolding; Auth.js config + route handler; `next.config.mjs` standalone.
**Success**: `docker compose config` valid; backend unit tests pass; containers start; Auth.js route responds.
**Tests**: `services/backend/tests/test_health.py`, `__tests__/lib/auth.test.ts`.

### Stage 1 — Backend data API 🔴
**Goal**: port all domain + training data access to Python; web becomes thin BFF.
**Deliverables**: SQLAlchemy models + Alembic migration for research/training/org/LMS tables; `/v1/data/*`;
25 `app/api/training/**` routes → proxies; consent + audit in Postgres; realtime via `LISTEN/NOTIFY` → SSE;
plugins per-user in Postgres; delete `lib/supabase/*` and `lib/local/*`.
**Success**: existing flows work through the backend; no `@supabase/*` or `dexie` imports remain.
**Tests**: pytest data/authz parity; Vitest proxy tests; Playwright training login/flow.

### Stage 2 — Agent runtime core 🔴
**Goal**: LangGraph harness + DeepSeek tool-calling.
**Deliverables**: model/tool/planner nodes, state, guardrails (privacy port), Postgres checkpointer;
`/v1/agent/runs` + resume + state; BFF proxy in `app/api/agents/[agent]/route.ts` behind `AGENT_RUNTIME=langgraph|legacy`.
**Success**: `deepseek-v4-flash` validated for `bind_tools`/streaming/usage; a run streams through the existing UI.
**Tests**: pytest graph tests with fake model; BFF contract; E2E flag on/off.

### Stage 3 — MCP client + server 🔴
**Goal**: real Model Context Protocol.
**Deliverables**: Python MCP servers (scholar, citations, journals, iScholar tools); MCP client pool;
iScholar MCP server endpoint; port SSRF/size guards.
**Tests**: MCP contract tests; SSRF/2 MiB cap tests.

### Stage 4 — Migrate 7 agents 🔴
**Goal**: one graph per built-in agent.
**Deliverables**: `graphs/{topic,litreview,design,data,write,submit,rebuttal}.py`; prompt reuse; `contextFrom` → graph state/retrieval; parity harness; per-agent rollout.
**Tests**: legacy-vs-new parity; consent/audit; per-agent E2E.

### Stage 5 — Evaluation harness 🔴
**Goal**: automated scoring in CI.
**Deliverables**: datasets, deterministic checks, LLM judge, thresholds; `pnpm agent:eval`; CI job.
**Tests**: eval report artifact; regression on Stage 4.

### Stage 6 — Hermes/training/plugins/cleanup 🔴
**Goal**: finish migration and delete legacy.
**Deliverables**: conversational + checkpointed training graphs; plugin agent/prompt-pack/declarative tool mapping; remove legacy direct-DeepSeek path.
**Tests**: full E2E + eval green; docs updated.

## Verification (per stage)

```
docker compose config
docker compose up -d postgres backend
services/backend: ruff check && pytest
web: pnpm lint && pnpm exec tsc --noEmit && pnpm vitest run && pnpm build
e2e: pnpm test:e2e   (against web container)
eval (Stage 5+): pnpm agent:eval
```

## Risks

- Platform rewrite → feature-freeze branch; legacy flags until parity.
- Dexie removal touches most components → migrate client feature by feature with a React Query shim.
- Auth.js credentials/adapter specifics → verified inside Stage 0.
- DeepSeek tool-calling unverified → Stage 2 first task; fallback `deepseek-chat` or manual ReAct.
- Server embedding cost → batch + cache; small model first.
- Eval nondeterminism → pinned judge model/temperature, seeded datasets, recorded baselines.
