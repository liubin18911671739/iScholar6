# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

iScholar v6.0 — AI-native academic research platform. Browser-local by default: research data lives in IndexedDB, AI via DeepSeek API, embeddings computed client-side. An **opt-in Supabase collaborative mode** (`NEXT_PUBLIC_COLLABORATIVE_MODE=true`) adds server-backed training camps, member management, remote submissions, and reviews. Guides researchers through the full lifecycle: topic discovery → literature review → research design → data analysis → manuscript writing → journal submission → peer review rebuttal. A training MVP ("AI 科研教练") at `/training` layers 8 coached tasks over the 7 agents.

Repository conventions (coding style, commit format, PR expectations) are in `AGENTS.md`: two-space indent, kebab-case filenames, PascalCase components, `@/` imports, conventional-commit prefixes (`feat:`, `fix:`, ...).

## Commands

```bash
pnpm dev          # Development server (localhost:3000)
pnpm build        # Production build (includes TS type-checking)
pnpm lint         # ESLint via next lint
pnpm test         # Vitest unit/component tests (watch mode)
pnpm test:e2e     # Playwright E2E tests (auto-starts dev server)

pnpm quality-gate           # scripts/quality-gate.mjs: lint → vitest → build → e2e
pnpm quality-gate:full      # same + --with-supabase --with-real-e2e remote checks
pnpm test:e2e:supabase      # REAL_SUPABASE_E2E=true run of e2e/supabase-collaboration.spec.ts
pnpm lint:supabase-schema   # scripts/lint-supabase-schema.mjs: verify remote tables via PostgREST (service-role key)
pnpm accept:supabase        # scripts/simulate-real-acceptance.mjs
```

**Running a single test file:**

```bash
pnpm vitest run __tests__/lib/local/auth.test.ts   # single Vitest file
pnpm vitest run                                   # all tests, single run (no watch)
```

**Running a single E2E test:**

```bash
pnpm playwright test e2e/login.spec.ts
```

Test locations: `__tests__/` for Vitest (unit + component + API-route tests, currently 46 files / 266 tests), `e2e/` for Playwright (13 files). `e2e/supabase-collaboration.spec.ts` is skipped unless `REAL_SUPABASE_E2E=true` (needs a real Supabase project + service key).

Vitest config (`vitest.config.ts`): jsdom environment, globals enabled, `@/` path alias resolves to project root. Setup file `vitest.setup.ts` mocks Web Crypto API (`crypto.subtle.digest`, `crypto.randomUUID`) and imports `@testing-library/jest-dom/vitest` for DOM matchers — jsdom doesn't provide these.

## Architecture

### Browser-Local Stack

- **Database**: Dexie (IndexedDB wrapper) — schema in `lib/local/db.ts`, instantiated as `localDB` (DB name `ischolar-v6-local`, currently schema v4 with 23 tables): the 14 research tables (projects, manuscripts, manuscriptBlocks, bibItems, attachments, ragChunks, experiments, submissions, reviewRounds, rebuttalItems, agentRuns, manuscriptVersions, auditLedger, tasks) plus 7 training tables (trainingPrograms, trainingTasks, trainingSubmissions, evidenceCards, trainingReviews, aiConsents, enrollments) plus 2 plugin tables (pluginInstalls, promptPackSelections — local-only, not synced to Supabase). Data access is via React hooks organized by entity in `lib/local/hooks/` (17 files — one per entity incl. `training.ts`/`training-admin.ts` + utils + barrel index), re-exported through `lib/local/hooks.ts` for backward-compatible `@/lib/local/hooks` imports. Call these hooks rather than touching Dexie directly from components.
- **Dexie → Supabase mirroring**: the bottom of `lib/local/db.ts` registers `creating`/`updating`/`deleting` hooks on every table that fire-and-forget `syncLocalMutation()` — in collaborative mode every local mutation is mirrored to Supabase; failures are logged, not thrown. Schema changes therefore affect the remote mapping too (see below).
- **Vector search**: Transformers.js runs Xenova/all-MiniLM-L6-v2 client-side for 384-dim embeddings. Web Worker at `lib/local/vector.worker.ts` keeps embedding off the main thread. Similarity search via cosine distance in `lib/local/vector.ts` with LRU caching (50 items, 5-min TTL).
- **Crypto fallback**: `lib/local/crypto-fallback.ts` provides pure-JS SHA-256 and UUID generation for environments where `crypto.subtle` is unavailable (SSR, jsdom).
- **State**: TanStack React Query for async/fetch state; Zustand for client-only state (`lib/stores/` — `index.ts` combines `LocaleSlice` and `SettingsSlice` from `slices/`, persisted to localStorage as `ischolar-locale`).
- **i18n**: `next-intl` with two locales (`zh-CN` default, `en-US`) — message catalogs in `messages/*.json`, config in `lib/i18n/config.ts`. Locale detection via `next-intl` plugin in `next.config.mjs` → `i18n/request.ts` (cookie/header based, URLs unchanged). **Both locale files must be updated for any new UI text** — missing keys throw `MISSING_MESSAGE`. Use `t.raw("key")` (not `t("key")`) to access array/object values, such as UserManual step arrays.
- **Auth**: Client-side local-password auth in `lib/local/auth.ts` (per-user random salt, SHA-256, session timeout). Protected routes redirect to `/login` via `app/(app)/layout.tsx`. Only `login/` route exists in the `(auth)` group; there is no register route. Collaborative mode adds Supabase Auth on top (see below) — the two are independent layers.

### Supabase Collaborative Mode (opt-in)

Off by default; everything below activates only when `NEXT_PUBLIC_COLLABORATIVE_MODE=true`.

- **Client layer** (`lib/supabase/`): `browser.ts` / `server.ts` create clients; `collaborative.ts` is the entry point — `isCollaborativeMode()`, `getCollaborativeAuthHeaders()` (bearer token for API calls), `requireCollaborativeUser()`, `syncAgentRun()` (POST/PATCH to `/api/agent-runs`), and `syncLocalMutation` used by the Dexie hooks. Supabase auth cookie refresh is handled by `middleware.ts` (only on `/training/:path*` and `/api/training/:path*` routes — not all routes).
- **Key mapping**: Supabase columns are snake_case; Dexie fields are camelCase. `lib/supabase/field-map.ts` is the canonical mapping — `DEXIE_TO_REMOTE_TABLE` (table names) + `REMOTE_COLUMN_MAP` (field names) + `toRemoteRecord()`/`fromRemoteRecord()` (drop `data`/`embeddingData` blobs). Its header documents the 4-step process for adding a synced field: migration → extend the maps → update `doc/database.md` → regression test in `__tests__/lib/supabase/field-map.test.ts`.
- **Remote reads**: `lib/supabase/remote-query.ts` — `remoteInsert/Upsert/Update/Delete` helpers and `useRemoteRows()` returning `RemoteListQuery<T>` (`{ data, error, refetch }`; `data === undefined` = loading). On failure it sets `error` instead of silently returning an empty list — render `<RemoteLoadError error={...} onRetry={refetch} />` from `components/collaborative/remote-load-error.tsx` (used by project list, dashboard, training, citations, agent workspace).
- **Roles**: `lib/supabase/roles.ts` — `requireStaff()` reads `profiles.role` and only allows `librarian`/`admin`. Staff-only routes (`/api/training/programs`, `/api/training/reviews`) use it.
- **Migrations**: `supabase/migrations/*.sql` (training collaboration, staff permissions, submission identity, collaborative core data, training local entities) — define tables + RLS. After changing a migration, run `pnpm lint:supabase-schema` (verifies remote tables via PostgREST) and update `doc/database.md`.
- **Server guard layer** (`lib/server/request-guards.ts`) — used by all API routes:
  - `requireApiUser(req)` — Supabase auth via bearer token or cookies; **no-op (returns ok) when collaborative mode is off**
  - `checkRateLimit(req, scope)` — in-memory, 20 req/min per IP+scope
  - `checkBodySize(req)` — 256KB default cap
  - `verifyConsent(...)` — validates an `AiConsentProof` (`lib/ai/consent.ts`) and, in collaborative mode, checks it against the `ai_consents` table
  - `createApiSupabaseClient` / `createServiceSupabaseClient` (service-role — server only, never expose `SUPABASE_SERVICE_ROLE_KEY`), `jsonError`, `timeoutSignal`
- **Body validation**: `lib/server/training-validation.ts` — Zod schemas for training submissions/programs/invites/reviews with a shared `validationError()` formatter.

### AI Consent Proofs

External AI/MCP calls require a recent consent proof: the client records consent (redaction confirmed + list of external services) locally in `aiConsents` and via `POST /api/ai/consents`, then sends `consentProof` (with `consentId`) in agent/MCP/hermes request bodies. Routes reject with 403 when the proof is invalid. Don't describe the app as "data never leaves the device" — DeepSeek/Crossref/OpenAlex/Semantic Scholar calls do leave.

### Module Workspace Shell (Conditional Layout)

`app/(app)/layout.tsx` uses `isModuleRoute(pathname)` to switch between two layouts:

- **Module pages** (7 agent routes matching `/projects/[id]/{agent}` plus plugin agents `p.<pluginId>.<key>` and `/tools/[tool]`): **full-bleed** — no sidebar or topbar. The module shell in `components/module/` renders:
  - `ModuleWorkspace` — orchestrator, wraps the cosmic-bg starfield backdrop
  - `ModuleTopBar` — back nav, module name + "· 学伴智枢" branding, project selector
  - `WorkflowStepper` — horizontal 8-stage progress bar; current stage gets per-color accent + glow
  - `FlowBreadcrumb` — receive-from → output-to breadcrumb
  - `AiDisclaimer` — per-agent AI disclaimer banner
  - `ModuleCard` — glassy card wrapper for inputs / preview / saved-output panels
  - `UserManual` — collapsible usage guide (sidebar on desktop, inline on mobile)
- **Shell pages** (dashboard, projects list, settings, training): standard cosmic sidebar + topbar layout.

### 8-Stage Workflow

Defined in `components/module/stages.ts`: 7 agents mapped to 8 workflow nodes (the `data` agent covers both stage 4 "数据采集" and stage 5 "数据分析"). Each stage defines **complete static Tailwind accent class strings** (cyan/sky/violet/teal/blue/emerald/fuchsia) — these are NOT dynamically constructed because Tailwind JIT requires complete class strings at compile time.

### 7 Specialized AI Agents

Defined in `lib/ai/agents/registry.ts` with IDs: `topic`, `litreview`, `design`, `data`, `write`, `submit`, `rebuttal`. Each has a system prompt in `lib/ai/prompts/` with a barrel `index.ts`. The `AgentId` type also accepts plugin agent IDs (`p.<pluginId>.<key>`) — see Plugin System below.

Agent execution flow:

1. Frontend calls `use-agent-run.ts` hook → builds input via `buildRunInput()` from the agent config → calls `runAgentStream()` in `lib/ai/agents/index.ts`
2. API route `app/api/agents/[agent]/route.ts` runs the guard chain (auth → body size → rate limit → agent ID → prompt length caps → consent proof), then proxies to DeepSeek API (`deepseek-chat` by default, overridable via `DEEPSEEK_MODEL`/`NEXT_PUBLIC_DEEPSEEK_MODEL`/`DEEPSEEK_API_URL`; OpenAI-compatible), streaming SSE chunks back via `ReadableStream`
3. Usage data (token counts) extracted from the final chunk via `__USAGE__` delimiter and saved to IndexedDB `agentRuns` table — cost (in cents) derived from token counts via `lib/ai/pricing.ts` (supports `deepseek-chat` and `deepseek-reasoner` models)
4. Audit entry with SHA-256 hashes of prompt/input/output written via `lib/audit/ledger.ts`; in collaborative mode the run is also synced to Supabase via `/api/agent-runs`
5. Progress estimated in the UI from character count: `results.length / 4 ≈ token count`, compared against per-agent estimated token budgets (`AGENT_ESTIMATED_TOKENS`)
6. Agent context building via `lib/ai/agents/context.ts` — assembles project/manuscript/previous-outputs context for each run

### Training MVP ("AI 科研教练")

- **Task definitions**: `lib/training/registry.ts` — 8 training tasks covering the 7 agents; scoring in `lib/training/scoring.ts` combines step completion, reflection, evidence verification, and review scores.
- **Pages**: `/training` (learner workspace), `/training/manage` (staff program management), `/training/review` (review queue), `/training/report` (personal report). Components in `components/training/` (`mvp-training.tsx`, `review-queue.tsx`, `report.tsx`).
- **Evidence cards**: learners attach AI claims + source excerpts/DOIs with a verification status (stored in `evidenceCards`).
- **Privacy checks**: `lib/privacy/sensitive-content.ts` detects phone numbers, emails, ID/student numbers before external calls.
- Runs fully locally by default; collaborative mode adds server programs, invitations, remote enrollment, submission sync, and staff reviews via the `/api/training/*` routes.

### MCP Tools

`app/api/mcp/[tool]/route.ts` exposes tool endpoints (same guard chain as agents). Implementations in `lib/mcp/tools/`: `citation-parser.ts`, `scholar-search.ts`, `journal-finder.ts`. Gateway logic in `lib/mcp/gateway.ts`.

### Plugin System (local-only, v1)

A manifest-based plugin system in `lib/plugins/` supports three extension types, all stored locally in IndexedDB (not synced to Supabase):

- **Custom agents**: Declarative agent definitions with input fields and prompt templates — accessible at `/projects/[projectId]/p.<pluginId>.<agentKey>`, rendered in the same full-bleed module workspace as built-in agents.
- **Prompt packs**: Override system/user prompts for any agent (built-in or plugin). Users select an active pack per agent in Settings.
- **Declarative MCP tools**: HTTPS tools with JSON Schema params, registered at runtime.

Key files: `lib/plugins/types.ts` (manifest schema), `lib/plugins/schema.ts` (validation), `lib/plugins/install.ts` (Dexie CRUD), `lib/plugins/registry.ts` (runtime registry), `lib/plugins/bootstrap.ts` (client-side init via `ensurePluginsBootstrapped()`), `lib/plugins/flags.ts` (feature flag `NEXT_PUBLIC_PLUGIN_SYSTEM`, default on). Plugin agent IDs use the format `p.<pluginId>.<key>` and cannot shadow the 7 built-in IDs. Sample manifests in `fixtures/plugins/`. Full docs in `doc/plugins.md`.

### Route Structure

- `app/` (`(marketing)/`) — landing page at root (`/`), plus `/docs`, `/features`, `/pricing`
- `app/(auth)/login/` — login (public, no register route exists)
- `app/(app)/` — main app (protected, conditional layout: full-bleed for modules, sidebar+topbar for shell pages)
  - `dashboard/` — overview / cost charts
  - `projects/` — project list
  - `projects/[projectId]/` — each agent gets its own sub-route matching the agent ID: `topic/`, `litreview/`, `design/`, `data/`, `write/`, `submit/`, `rebuttal/`; plugin agents use `p.<pluginId>.<key>/`
  - `settings/` — app settings
  - `tools/` — standalone tools list; `tools/[tool]/` — dynamic tool workspace
  - `training/` — training MVP (+ `manage/`, `review/`, `report/`, `analytics/`, `verify/`)
- `app/api/agents/[agent]/` — AI agent streaming endpoint (300s max duration)
- `app/api/hermes/chat/` — general-purpose chat endpoint (separate from the 7 agents)
- `app/api/mcp/[tool]/` — MCP tool endpoint (60s max duration)
- `app/api/agent-runs/` — collaborative-mode agent-run sync (POST/PATCH)
- `app/api/ai/consents/` — AI consent proof recording
- `app/api/training/` — `me/` (learner state), `programs/` + `programs/[programId]/members/` (staff), `reviews/` (staff)
- `app/modules/*` — legacy redirects to `/projects` (pre-project module routes); don't add features here

### Agent Page Pattern

All 7 agent pages are thin wrappers: each renders `<AgentPageTemplate config={X_CONFIG} />` from `components/agents/agent-page-template.tsx`, which renders `<ModuleWorkspace>`. The per-agent behavior lives across two locations:

**Top-level config object** in `components/agents/agent-configs.tsx`:

- `InputsComponent` — per-agent form fields (react-hook-form pattern with `fieldState`/`setField`)
- `ResultsComponent` — optional custom rendering (e.g. RichEditor for `write`, `<pre>` fallback)
- `OutputComponent` — structured output panel in `components/agents/outputs/` (charts, tables, diffs)
- `buildRunInput` — maps form state to API input
- `manuscriptSection` / `manuscriptOrder` / `onApplyExtra` — standard apply: creates manuscript block + agent-specific side effects (create bib items, experiments, submissions, etc.)
- `customOnApply` — overrides the standard apply entirely (used by `write`, `submit`, `rebuttal`)

**Per-agent subdirectories** in `components/agents/configs/{agent}/` — each contains `config.ts` (sub-config), `{Agent}Inputs.tsx`, `{Agent}ModuleContent.tsx`, plus agent-specific components (charts for data, editor ref for write).

Each agent's `AgentStatus` cycles through: `idle` → `running` → `needs_review` → `approved` → `applied` (or `rejected`/`failed`).

To add a new agent: system prompt → registry entry → Zod schema → route page → config object → output panel → per-agent config subdirectory → i18n keys in both locales. See `doc/development.md` for the full 8-step checklist.

### Error Boundary Hierarchy

Three levels of error boundaries, outermost first:

1. `app/error.tsx` (root) — catches unhandled SSR/CSR errors, shows full-page cosmic-panel with error digest
2. `app/(app)/error.tsx` — catches errors within the authenticated app shell
3. `components/agents/error-boundary.tsx` — wraps individual agent module workspaces

### Key Libraries

| Concern | Library | Location |
| --- | --- | --- |
| UI primitives | Radix UI + shadcn/ui | `components/ui/` (30 components) |
| Rich text editor | Tiptap | `components/editor/` (used in write stage) |
| Forms | react-hook-form + zod | standard pattern across pages |
| Toast notifications | Sonner | wired in root layout |
| IDs | nanoid | all entity IDs |
| Date formatting | date-fns | display dates |
| Charts | recharts | cost dashboard, agent outputs |
| Async state / caching | TanStack React Query | used in data-fetching hooks |
| Client state | Zustand | `lib/stores/` — persisted to localStorage as `ischolar-locale` |
| Icons | lucide-react | used throughout |
| Diff comparison | diff | `components/editor/diff-viewer.tsx` |
| Server sync | @supabase/supabase-js + @supabase/ssr | `lib/supabase/`, `lib/server/` |
| Client-side embeddings | @huggingface/transformers (Xenova/all-MiniLM-L6-v2) | `lib/local/vector.ts` + `lib/local/vector.worker.ts` |
| Markdown rendering | marked | agent output display |
| LaTeX rendering | katex | `components/editor/extensions/latex.tsx` |
| Code highlighting | lowlight | Tiptap code-block extension |
| PDF parsing | pdfjs-dist | `lib/pdf/parse-review.ts` |
| ZIP export | jszip | `lib/export/submission-package.ts` |
| AI SDK | ai (Vercel) | streaming agent responses |

### Notable Capabilities

These span multiple files and are worth knowing about:

- **Project wizard**: Multi-step creation dialog (`components/projects/wizard-dialog.tsx` + `wizard-step.tsx`) for naming, discipline, and goal.
- **Tiptap editor extensions**: `components/editor/extensions/` has custom citation marks (`citation-mark.tsx`) and LaTeX rendering (`latex.tsx`). The `write` agent uses a RichEditor ref (`components/agents/configs/write/editor-ref.ts`).
- **Version diffing**: `components/editor/diff-viewer.tsx` renders inline manuscript diffs using the `diff` library (line-by-line with additions/removals highlighted).
- **PDF parsing**: `lib/pdf/parse-review.ts` extracts review comments from PDF review files.
- **Export**: `lib/export/submission-package.ts` creates a zip bundle (manuscript + figures) for journal submission; `lib/local/export.ts` exports project data (full + incremental JSON, Base64 blobs).
- **Service worker**: `components/providers/sw-register.tsx` registers a PWA service worker in the root layout.
- **Figma-style tool pages**: `components/tools/tool-workspace.tsx` renders standalone tools in the module shell (full-bleed, no sidebar).

### Theme System

**Token format**: `app/globals.css` defines CSS custom properties as **space-separated HSL components** (e.g. `--primary: 216 98% 52%`). Do NOT wrap them in `hsl()` or use hex values — this format works for both Tailwind utility classes and inline `hsl(var(--token))` styles in recharts.

**Single dark theme** with IBM Technology Blue (`#0f62fe`) as the primary color. Theme is set via custom `ThemeProvider` (`components/providers/theme-provider.tsx`, not next-themes) that always applies `data-theme="dark"`. The Zustand settings slice (`lib/stores/slices/settings-slice.ts`) still exports `type Theme = "dark"` for forward compatibility but only one value is valid. Key utility classes:

- `.cosmic-bg` — applies layered deep-blue glows + repeating starfield (use on positioned, overflow-hidden containers)
- `.cosmic-panel` — glassy translucent card (backdrop-blur + semi-transparent bg)
- `.glow-cyan` / `.glow-violet` — soft outer glow for hero/CTA elements

### Configuration Notes

- `next.config.mjs`: server actions with 10MB body limit; webpack fallbacks (`fs`, `path`, `crypto` → false) for browser-only modules.
- `vercel.json`: function timeouts — 300s for agents, 60s for MCP tools.
- Root layout sets `lang="zh-CN"` and `className="dark"` (dark mode by default).
- **Environment**: `DEEPSEEK_API_KEY` required. Optional: `DEEPSEEK_API_URL`, `DEEPSEEK_MODEL`/`NEXT_PUBLIC_DEEPSEEK_MODEL` (code default `deepseek-chat`; `.env.example` suggests `deepseek-v4-flash`), `NEXT_PUBLIC_APP_URL`. Collaborative mode: `NEXT_PUBLIC_COLLABORATIVE_MODE`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY` (member invitations — must never reach the browser). Plugin system: `NEXT_PUBLIC_PLUGIN_SYSTEM=false` to disable (default on). See `.env.example`.
- **Node version**: ≥ 22 required in practice — Node 20 throws `TypeError: Promise.withResolvers is not a function` during full-page SSR of dynamic module routes (pdfjs-dist needs Node 22+). The project uses pnpm as the package manager.
- **CI** (`.github/workflows/ci.yml`): runs on pushes/PRs to `main` on ubuntu-latest. Node 22, uses **npm ci** (not pnpm). Steps: lint → vitest (`--run`) → install Playwright → build → E2E tests (same-repo PRs only, requires `DEEPSEEK_API_KEY` secret).
- **Data compatibility**: changes to Dexie schemas, import/export formats, auth, audit-chain behavior, or the camelCase↔snake_case sync mapping need migration/compatibility consideration and regression tests (see `AGENTS.md` and `TODO.md` P0 items).

### Documentation

Detailed guides in `doc/`:

- `doc/usage.md` — user guide (setup, workflows, citation management)
- `doc/development.md` — dev guide (commands, architecture, adding agents, i18n)
- `doc/deployment.md` — deployment guide (Vercel, Docker self-hosting)
- `doc/architecture.md` — deep-dive architecture reference (frontend, AI, MCP, local data, Supabase collaboration)
- `doc/database.md` — IndexedDB tables, Supabase tables, RLS, data lifecycle
- `doc/examples.md` — usage examples and walkthroughs
- `doc/plugins.md` — plugin system (manifests, custom agents, prompt packs, declarative MCP tools)
- `doc/lms.md` — LMS/AGS integration (Canvas, Moodle gradebook push)

`TODO.md` tracks the current roadmap and verified test baselines; `IMPLEMENTATION_PLAN.md` tracks in-flight staged work (delete when all stages complete).
