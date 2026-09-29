# TODO.md — iScholar v6.0 路线图

> 最近更新：2026-09-30  
> 状态标记：🔴 未开始 | 🟡 进行中 | 🟢 已完成 | ⚪ 可选增强  
> **权威路线图是 [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md)**（记录锁定决策与阶段状态）；本文件面向工程执行，跟踪细化任务与验证记录。  
> **2026-09-30：P1 迁移执行（T1–T3 进行中，B 方案）。** 补齐 coach/plugin 图（`app/agents/graphs/{training,plugin}.py`）与 SMTP 邀请（`lib/server/smtp.ts` + `invite-token.ts` + `/api/invites{,/accept}` + `/(auth)/accept-invite`）；后端训练形状补齐（programs `access`/`scope`+嵌套 enrollments、tasks/task-packs 信封、组织成员 `canManage`+联系人）；新增训练 BFF `app/api/training/[...path]`；删除 4 个旧路由（calendar/peer/certificates.verify/organizations）并迁移对应组件。后端 `pytest` 117 / `ruff` 0；前端 `tsc`/`lint`/`vitest`（55 文件 277）/`build` 绿。详见 P1 章节。
> **2026-09-30：全仓审计与加固（P0–P2）。** 对前端/BFF、Python 后端、基础设施与测试逐项审计并修复：
> - **构建 / 旧 API 鉴权**：修复 `/tools/[tool]` 编译失败（补 `useRef`/`nanoid`，改真实临时项目）；`requireApiUser` 改为要求真实 Auth.js 会话（仅 `ALLOW_LOCAL_API=true` 且非 production 可绕过）；`/api/hermes/chat` 补同意门；BFF 代理修 `%2F` 路径穿越（每段 `encodeURIComponent` + `/v1/<root>` 前缀断言）。
> - **同意体系统一（收敛到 `ai_consents_v2`）**：新增 `GET /v1/audit/consents/{id}`；`verifyConsent`/`verifyProgramConsent` 改为**失败关闭**校验后端（`fetchBackendConsent`）；训练提交/camp 同意不再伪造 `camp:` project（Alembic `0010` 允许 `project_id` 为空）；审计 UI 改读后端（`lib/client/hooks/audit.ts`）。
> - **后端鉴权 / 完整性**：MCP `ischolar.*` 跨用户 IDOR 修复（注入签名 owner、绑定 consent project、共享 token 服务端不再暴露领域工具）；训练报表/导出/提醒/证书/同意/进度/评审改组织范围（替换 `is_global_staff`）；学习者提交状态限定 `draft/submitted`；审计链加项目行锁、幂等键改 `UNIQUE(owner_id, idempotency_key)`（`0011`）、运行事件序号改 **advisory lock**（避免阻塞 `cancel_run`）、NOTIFY 按字节截断、HMAC 非 ASCII 修复、SSRF 解析 DNS、附件上传前置限长、CSV 公式注入转义、MCP 请求体中间件限长、删除死表 `plugin_mcp_tools`（`0012`）。
> - **基础设施 / 安全**：compose `build.target: prod`、密钥必填 + 生产哨兵校验、`ENVIRONMENT=production`、后端/DB 端口绑 `127.0.0.1`、restart/healthcheck/`no-new-privileges`；Caddy 自动 TLS + 安全头、Next `headers()`；后端/评估镜像非 root；Docker 前端 `NEXT_PUBLIC_*` 构建参数；`db/init` healthcheck 用 TCP + `users` 表探测；登录限流；删除 `install-release.sh`/`vercel.json`。
> - **测试 / 死代码**：`ledger.test.ts` 重写（mock 后端客户端）；新增 HMAC 签名与代理 401 测试；修复一个空洞后端测试；删除 5 个无引用模块 + 3 个过期测试。
> 验证：后端 `ruff` 0 / `pytest` **116**；`services/eval` `ruff` 0 / `pytest` 7；前端 `tsc`/`lint`/`vitest`（**54 文件 273 用例**）/`build` 全绿；`docker compose config` 通过；迁移 head `20260929_0012`。
> **2026-09-28：Stage 1c 后端三项落地。** 同意/哈希链审计（Alembic `0007` + `/v1/audit` + 纯函数链校验）、实时 `LISTEN/NOTIFY`→SSE（`/v1/realtime/*` + `pg_notify`）、BFF `/api/audit` + `/api/realtime` + `/api/vectors`；插件改为后端 `/v1/plugins` 持久化（`lib/client/plugins.ts`）；遗留类型抽取至 `lib/types/domain.ts`。后端 `pytest` 111、`ruff` 0；前端 `tsc`/`lint`/`vitest`（289）/`build` 全绿。训练/智能体 UI 迁移与 `lib/supabase`/`lib/local` 删除待续。  
> **2026-09-28 状态核查（无实现变更）：** `AGENT_RUNTIME=langgraph` BFF 桥接、评估 LLM judge、插件按用户落 Postgres 均已落地，据此修正 Stage 2/4/5/6 任务清单中的滞后标记（原仍标 🔴）。  
> **2026-09-27：Stage 4 切换 + Stage 5 judge + Stage 6 插件。** BFF `AGENT_RUNTIME=langgraph` 桥接（`lib/server/agent-runtime.ts`：建线程/运行 + 轮询产物流式回传；默认 legacy）；后端 run 同意校验改为 `AGENT_REQUIRE_CONSENT` 可配；评估 harness 增可选 LLM judge（`EVAL_JUDGE`）；插件按用户落 Postgres（`app/models/plugins.py` + Alembic `0006` + `/v1/plugins` + BFF 代理）。后端 `pytest` 84、评估 `pytest` 7、`ruff` 0。  
> **2026-09-27：Stage 4/5 + Hermes + MCP 收尾。** `app/agents/{prompts,schemas,model}.py` + `app/agents/graphs/*`（7 智能体图 + Hermes 图）、`contextFrom` 产物检索、Pydantic 结构化输出、Fake/DeepSeek 模型、奇偶校验；`services/eval` 数据集 + 确定性检查 + 阈值报告（离线 6/6）；MCP 增 `ischolar.*` 领域工具 + `MCP_SERVER_TOKEN`。后端 `pytest` 81、评估 `pytest` 5、`ruff` 0。  
> **2026-09-27：Stage 3 MCP 后端就绪。** 新增 `app/mcp/{guards,tools/*,registry,server,pool}.py`（SSRF/2 MiB 守卫、4 个学术检索工具、FastMCP 服务端、streamable HTTP 客户端池）+ `/v1/mcp/tools` REST + BFF 代理；`AgentHarness` 改用注册表；后端 `pytest` 55 绿、`ruff` 0，前端 `vitest`（56 文件 289 用例）绿。iScholar 领域工具与外部端点鉴权待续。  
> **2026-09-27：E2E 全绿。** E2E 改用 Auth.js 会话：`e2e/global-setup.ts` 播种 staff/learner 用户（bcrypt），`playwright.config.ts` 注入 host 可达 `AUTH_DATABASE_URL` 并配置 globalSetup，`e2e/helpers/auth.ts` 走 credentials callback，`top-bar.tsx` 改用 `next-auth` `signOut`；`pnpm test:e2e` 51 通过 / 1 跳过（Supabase 协作用例）。已知问题 #12 关闭。  
> **2026-09-27：Stage 1b 后端地基。** 新增 `app/models/training.py`（15 表）+ Alembic `20260927_0004` + authz（`can_manage_org`/`can_read_program`）+ `/v1/training` 核心路由（programs/enrollments/tasks/organizations/submissions/reviews）；后端 `ruff` 0 + `pytest`（32）绿，Alembic 离线 SQL 渲染通过。24 路由代理与前端训练迁移待续。  
> **2026-09-27：Stage 1a 前端数据层落地。** 引入 `QueryProvider`（挂载于 `app/layout.tsx`）、`lib/client/data.ts`（`/api/data` BFF 客户端）与 `lib/client/hooks/*`（React Query 科研 hooks）；`lib/local/hooks.ts` 改为 `NEXT_PUBLIC_DATA_BACKEND=legacy|backend` 开关 shim（默认 legacy），科研 hooks 按开关切换，旧实现保留至 1c。新增 `__tests__/lib/client/{data,hooks,resolver}`；前端 `tsc` / `lint` / `vitest`（55 文件 290 用例）/ `build` 绿。`NEXT_PUBLIC_COLLABORATIVE_MODE` 残留仍在（P1）。仅 `pnpm test:e2e` 仍红。  
> **2026-09-26 状态核查（无实现变更）：** `services/backend/app/api/v1/data/` 共 12 资源（+`common.py`/`__init__.py`）、`/v1/vectors`、`/api/agent` + `/api/data` 双 BFF、3 个 Alembic 迁移、后端 `pytest`（22）、前端 `vitest`（52 文件）。
> **2026-09-25：Stage 1a 完成。** 科研核心 12 个 `/v1/data/*` 资源（含 blocks 快照/reorder/rollback、attachments multipart + 文件系统 blob、bib-items bulk）、`/v1/vectors` embed/search/status、共享 BFF 代理（`/api/agent` + `/api/data`）全部落地；后端 `ruff` + `pytest`（22）绿，前端 `tsc` / `lint` / `vitest`（52 文件 279 用例）/ `build` 绿。仅 `pnpm test:e2e` 仍红——E2E 助手仍走已移除的本地密码鉴权，需改用 Auth.js 会话。详见「已知问题与阻断项」。

---

## 当前状态

平台正在从「浏览器本地（Dexie/IndexedDB）+ 可选 Supabase」迁移到**全 Docker 平台**（Next.js BFF + Python FastAPI/LangGraph + PostgreSQL/pgvector + Redis + Caddy）。旧栈仍在运行，按阶段逐步删除。

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| Stage 0 · Docker + Postgres + Auth | 🟢 完成 | 全栈 Docker 起且健康（web/backend/worker/postgres/redis/proxy）；backend 切片、HMAC 服务身份、Auth.js（`lib/auth.ts` + Edge-safe `lib/auth.config.ts` + `middleware.ts`）、`db/init` auth 表、Alembic；`ruff`/`pytest`/`tsc`/`lint`/`vitest`/`build` 全绿 |
| Stage 1 · 后端数据 API | 🟡 进行中（1a、1b 后端、1c 后端完成） | 拆分为 1a/1b/1c；**1a 已完成**：科研核心 schema（11 表）+ 12 个 `/v1/data/*` 资源 + authz 策略 + 文件系统 blob + `/v1/vectors` + BFF 代理（`/api/agent`、`/api/data`）+ 前端 React Query 数据层（`lib/client/*`，`NEXT_PUBLIC_DATA_BACKEND` 开关）；**1b 后端已完成**：训练/组织/LMS 15 表 + Alembic `0004`/`0005` + `/v1/training` 全套路由（submissions/reviews/peer、programs/{progress,report,export,certificates,consents,nudge}、analytics/calendar/task-packs/lms）；**1c 后端已完成**：`/v1/audit`（同意 + 哈希链，Alembic `0007`）、`/v1/realtime` SSE、插件落 Postgres；剩余 24 个训练路由改代理 + 训练/智能体前端迁移，之后删除 `lib/supabase/*`、`lib/local/*` |
| Stage 2 · Agent 运行时核心 | 🟡 后端切片已就位 | 后端已有 durable run API（threads/runs/SSE 事件流/resume/cancel）、`AgentHarness`、LangGraph + Postgres checkpointer、worker；`app/api/agents/[agent]` 已有 `AGENT_RUNTIME=langgraph` 桥接（默认 legacy）；**剩余**：DeepSeek `bind_tools`（工具调用）与流式输出 |
| Stage 3 · MCP 客户端 + 服务端 | 🟢 后端完成 | 内置 + iScholar 领域工具注册表、SSRF/2 MiB 守卫、FastMCP 服务端（stdio/HTTP + `MCP_SERVER_TOKEN`）、客户端池、`/v1/mcp` REST + BFF 代理；2026-09-30 加固：`ischolar.*` 仅经受签名 REST 暴露、请求体限长中间件；声明式插件持久化已判定为死代码（表已删） |
| Stage 4 · 迁移 7 个智能体 | 🟡 后端 + 切换就绪 | 7 张图 + prompts + `contextFrom` 产物检索 + Pydantic 结构化输出 + Fake/DeepSeek 模型 + 奇偶校验 + BFF `AGENT_RUNTIME=langgraph` 桥接；默认仍 legacy，UI 上线待续 |
| Stage 5 · 评估 harness | 🟡 离线可用 | 数据集 + 确定性检查 + 阈值报告 + `EVAL_MODE=live` + 可选 LLM judge；CI 作业待续 |
| Stage 6 · Hermes/训练/插件/清理 | 🟡 进行中 | Hermes 对话图 + 插件按用户 Postgres（`/v1/plugins`）；训练图、前端插件迁移、删除遗留直连 DeepSeek 路径待续 |
| 旧栈功能（迁移期仍在线） | 🟢/🟡 | 7 智能体、模块外壳、训练营、插件、单测/构建见下 |

---

## 已知问题与阻断项（2026-09-24 两轮实测；全部已修复）

第二轮修复后复测（Node 22.20 / pnpm 10.31 / Python 3.12 + uv / Docker Desktop）：

| # | 检查 | 结果 | 修复 |
| --- | --- | --- | --- |
| 1 | `pnpm install --frozen-lockfile` | 🟢 通过 | `pnpm install --no-frozen-lockfile` 刷新 `pnpm-lock.yaml`（补齐 `bcryptjs`、`pg`、`next-auth`、`@types/bcryptjs`、`@types/pg`） |
| 2 | `pnpm exec tsc --noEmit` | 🟢 通过 | `tsconfig.json` 的 `include` 增加 `types/**/*.d.ts`，使 `next-auth` 的 `role` 类型增强生效 |
| 3 | `pnpm lint` | 🟢 通过 | 删除 `lib/server/backend.ts` 中未使用的 `SIGNATURE_WINDOW_SECONDS` |
| 4 | `pnpm vitest run` | 🟢 51 文件 / 274 用例通过 | `isCollaborativeMode()` 改回环境驱动（`NEXT_PUBLIC_COLLABORATIVE_MODE==="true"`）；`requireApiUser()` 在非协作模式返回本地身份；修正 top-bar 断言；删除引用已移除模块 `@/lib/local/auth` 的孤儿测试；新增 `authorized` 回调测试 |
| 5 | 后端 `ruff check` | 🟢 通过 | `pyproject.toml` 增加 `flake8-bugbear.extend-immutable-calls`（FastAPI `Depends`/`Header` 默认值）；`ruff check --fix` 修导入排序 / 未用导入 / `UP017`；合并 `models/__init__.py` 重复 docstring |
| 6 | `pnpm build` | 🟢 通过 | 随 #2 解除（standalone 构建成功） |
| 7 | 后端 `pytest` | 🟢 7 用例通过 | 需先 `uv sync --extra dev`（仓库 `.venv` 默认不含 pytest/ruff） |
| 8 | `pnpm docker:up`（web 镜像） | 🟢 通过 | 根因：Docker 内 corepack 拉取 pnpm 12，`pnpm-workspace.yaml` 的 `allowBuilds` 非标准键 → `ERR_PNPM_IGNORED_BUILDS`。修复：`package.json` 固定 `packageManager: pnpm@10.31.0`，`pnpm-workspace.yaml` 改用 `ignoredBuiltDependencies` |
| 9 | 容器级健康检查 | 🟢 通过 | 全栈起（backend/postgres/redis healthy、web/proxy/worker up）；`migrate` 依序应用 2 个迁移；`/v1/healthz`、`/v1/readyz` 返回 ok；web :3000 与 Caddy :80 返回 200 |
| 10 | `middleware.ts` Supabase 刷新 | 🟢 已替换 | 新增 Edge-safe `lib/auth.config.ts`；`middleware.ts` 改为 Auth.js middleware，matcher 覆盖 `/dashboard|/projects|/settings|/tools|/training`；容器内未登录访问 `/projects`、`/dashboard` → 307 `/login` |
| 11 | `AUTH_SECRET` 构建期 | 🟢 非必需 | 临时移除 `.env` 后 `pnpm build` 仍成功；仅运行时需要，compose `.env` 已提供，Dockerfile 占位符为防御性保留 |
| 12 | `pnpm test:e2e` | 🟢 已修复 | E2E 改用 Auth.js：新增 `e2e/global-setup.ts` 播种 `users`（staff + learner，bcrypt），`playwright.config.ts` 注入 host 可达的 `AUTH_DATABASE_URL` 并配置 globalSetup；重写 `e2e/helpers/auth.ts`（`authenticate` 走 credentials callback）、`e2e/login.spec.ts`，`top-bar.tsx` 改用 `next-auth` 的 `signOut`。全量 `pnpm test:e2e` 51 通过 / 1 跳过（Supabase 协作用例） |

> `docker compose config` 通过。E2E 浏览器二进制已安装（`playwright install chromium-headless-shell`）。Docker 栈当前保持运行。
> 注（2026-09-30）：上表 #4 所述「非协作模式返回本地身份」已在 2026-09-30 审计中收紧——`requireApiUser` 现要求真实 Auth.js 会话，仅显式 `ALLOW_LOCAL_API=true`（且非 production）可绕过。

---

## 迁移任务（按 Stage）

### Stage 0 — Docker + Postgres + Auth 🟢

- 🟢 `docker-compose.yml` / `docker-compose.dev.yml` / `docker/web.Dockerfile` / `proxy/Caddyfile`
- 🟢 `services/backend`：FastAPI config、async DB、`/v1/healthz`、`/v1/readyz`、`/v1/me`、`/v1/data/projects`（GET/POST）、`/v1/agent/*`（threads / runs / events SSE / resume / cancel）、`AgentHarness`、LangGraph + Postgres checkpointer、worker（`SKIP LOCKED` 租约）、Alembic（2 个迁移）
- 🟢 服务身份：HMAC-SHA256 `X-IScholar-*` 头 + `AGENT_SERVICE_TOKEN`，后端 ±300s 校验（`app/core/security.py`，web 侧 `lib/server/backend.ts`）
- 🟢 `db/init`：扩展（`pgcrypto` / `citext` / `vector`）+ auth 表（`users` / `accounts` / `verification_token`）
- 🟢 Auth.js：`lib/auth.ts`（Credentials + Postgres）、`app/api/auth/[...nextauth]/route.ts`；`lib/auth.config.ts`（Edge-safe）+ `middleware.ts` 在 Edge 侧守卫 `/dashboard|/projects|/settings|/tools|/training`
- 🟢 后端 `pytest`：`services/backend/tests/test_health.py`（服务身份 5 例）+ `test_agent_contract.py`（2 例）通过；运行前需 `uv sync --extra dev`
- 🟢 后端 `ruff check` 通过；Web 侧 `tsc` / `lint` / `vitest`（274 用例）/ `build` 全部通过
- 🟢 容器级验证：`pnpm docker:up` 全栈起且健康（backend/postgres/redis healthy，web/proxy/worker up）；`migrate` 依序应用 2 个 Alembic 迁移；`/v1/healthz`、`/v1/readyz` 返回 ok；web :3000 与 Caddy :80 返回 200；未登录访问 `/projects`、`/dashboard` 被 307 重定向到 `/login`
- 🟢 `pnpm-workspace.yaml` 改用标准键 `ignoredBuiltDependencies`，并在 `package.json` 固定 `packageManager: pnpm@10.31.0`——此前 Docker 内 corepack 拉取 pnpm 12 会因 `allowBuilds` 未识别而 `ERR_PNPM_IGNORED_BUILDS` 导致 web 镜像构建失败
- 🟢 `AUTH_SECRET` 实测**非**构建期必需（临时移除 `.env` 后 `pnpm build` 仍成功）；仅运行时需要，compose `.env` 已提供，Dockerfile 的占位符为防御性保留

### Stage 1 — 后端数据 API 🟡（拆分为 1a/1b/1c）

切换方式（计划，尚未接线）：`NEXT_PUBLIC_DATA_BACKEND=legacy|backend`，逐功能切换，遗留路径在 parity 后删除。

#### 1a — 科研核心 🟢
- 🟢 科研核心 SQLAlchemy 模型（`app/models/research.py`：manuscripts/blocks/versions/bib_items/attachments/rag_chunks/experiments/submissions/review_rounds/rebuttal_items/tasks）+ `projects` 客户端字段
- 🟢 Alembic `20260925_0003_research_core`：11 表 + `projects` 扩展 + `owner_id` → `users(id)` FK（已应用到运行库）
- 🟢 授权策略 `app/core/authz.py`（owner/staff/org/program 纯函数）+ pytest parity（`tests/test_authz.py`）
- 🟢 `/v1/data` 共 12 资源：`projects`、`manuscripts`、`manuscript-blocks`（reorder + 内容快照 + `/{id}/rollback`）、`manuscript-versions`、`bib-items`（含 bulk）、`rag-chunks`、`attachments`（multipart 上传 / 鉴权下载）、`experiments`、`submissions`、`review-rounds`、`rebuttal-items`、`tasks`；camelCase 收发；跨用户 404
- 🟢 文件系统 blob 存储（`app/storage/blobs.py`：sha-256、25 MiB 上限、opaque 名防穿越）+ compose `storage` 卷 / `STORAGE_DIR`
- 🟢 向量：`/v1/vectors` embed/search/status（`app/vectors/*`；可选 `sentence-transformers`，未安装返回 503，`vectors` compose profile 跑 backfill worker）
- 🟢 BFF：`lib/server/backend-proxy.ts` 共享签名代理（根 allowlist `agent`/`data`/`vectors` + 路径穿越守卫）；`/api/agent` 支持 GET/POST/PUT/PATCH/DELETE/HEAD，新增 `/api/data/[...path]`
- 🟢 测试：`__tests__/api/data-proxy.test.ts`（vitest）、`tests/test_data_contract.py`、`tests/test_vectors.py`
- 🟢 前端：`components/providers/query-provider.tsx`（React Query）+ `lib/client/query-client.ts` + `lib/client/data.ts`（`/api/data` 客户端）+ `lib/client/hooks/*`（科研 hooks 镜像旧签名）；`lib/local/hooks.ts` 为 `NEXT_PUBLIC_DATA_BACKEND=legacy|backend` 开关 shim（默认 legacy；原 `lib/client/config.ts` 已删除，开关内联于此）；blocks 版本快照/内容哈希改由后端负责

#### 1b — 训练 / 组织 / LMS 🟡（后端地基 + 学员/评审/互评切片完成）
- 🟢 训练/组织/LMS 表模型（`app/models/training.py`：programs / enrollments / submissions / reviews / tasks / evidence_cards / program_tasks / task_packs / task_definitions / certificates / peer_assignments / peer_reviews / organizations / organization_members / lms_links）+ Alembic `20260927_0004`（identity FK → `users(id)`）
- 🟢 `/v1/training` 核心路由：programs（列表/创建/读取/更新/归档）、enrollments（成员增删改）、tasks（课程表替换）、organizations + members、submissions（本人提交/项目列表/认领）与 reviews（移植 `review_training_submission` 事务逻辑）
- 🟢 学员/评审/互评：`/v1/training/me`（报名 + `include=submissions` + 提交含同意校验）、`/v1/training/reviews`（队列 + claim/review）、`/v1/training/peer`（`complete_peer_review` 事务移植）
- 🟢 同意/审计地基：Alembic `20260927_0005` 扩展 `ai_consents_v2`（program/task/purpose/dataCategories/sensitiveScan）+ `audit_ledger` 表
- 🟢 authz 扩展：`can_manage_org`、`can_read_program` + 访问解析 deps（program TA / 报名 / org 角色）
- 🟢 后端路由补齐：`me`（含 `include`）、`reviews`（队列/claim/decision）、`peer`（`complete_peer_review`）、`programs/{id}/{progress,report,export,certificates,consents,nudge,tasks}`、`analytics/dashboard`、`calendar`、`task-packs`、`certificates/verify`、`me/certificate`、`lms/{link,gradebook}`；纯逻辑移植 `app/training/{catalog,progress,reporting,calendar,certificate,export}.py`
- 🔴 AGS 成绩推送（`lms/push`）与 `lib/lms/lti/ags.ts` 移植
- 🔴 前端迁移（选项 a）：`lib/client/training.ts` + React Query 训练 hooks（camelCase），迁移 16 个直连 `/api/training/*` 的组件，然后删除 24 个 web 路由；运营更新先用轮询
- 🔴 SMTP 邀请邮件（web BFF 拥有 `users`；新增 `nodemailer` + `SMTP_*`）
- 🔴 迁移训练 hooks/组件到 `/v1/training`；运营更新先用轮询
- ⚠️ 形状耦合：旧 web 路由返回 Supabase snake_case/嵌套形状，后端为 camelCase；纯 pass-through 需先统一前端 hooks 或让 web 适配层重映射——代理策略落地前确认

#### 1c — 同意/审计、实时、插件、清理 🟡
- 🟢 同意 + 哈希链审计 API 落 Postgres：Alembic `20260928_0007` 增 `audit_ledger.chain_hash`；`/v1/audit`（append/list/verify）+ `/v1/audit/consents` 写入 `ai_consents_v2`；纯函数 `app/core/audit.py`（SHA-256 链、`verify_chain`）；BFF `/api/audit/[...path]`
- 🟢 实时 `LISTEN/NOTIFY` → SSE：`app/core/notify.py`（`pg_notify` 事务内发送）+ `/v1/realtime/projects/{id}`、`/v1/realtime/training`（asyncpg `LISTEN`）；审计/同意与训练提交/评审写入时通知；BFF `/api/realtime/[...path]`
- 🟢 插件安装 / 提示词包按用户落 Postgres（已提前至 Stage 6 落地：`/v1/plugins`）
- 🟡 删除 `lib/supabase/*`、`lib/local/*`：中立类型已抽取至 `lib/types/domain.ts` + `lib/client/types.ts`（新数据层不再依赖遗留类型）；插件（`lib/plugins/install.ts`→`/v1/plugins`）、侧栏/模块顶栏、模块助手、提交包导出已迁至后端；**剩余**：训练/智能体 UI 迁移后再删除目录与 `@supabase/*`/`dexie` 依赖

### Stage 2 — Agent 运行时核心 🟡

- 🟢 Postgres checkpointer（`langgraph-checkpoint-postgres`，`AsyncPostgresSaver`）
- 🟢 `/v1/agent/threads` + `/v1/agent/runs` + `/resume` + `/cancel` + `/events`（SSE，可断线续传）
- 🟢 `AgentHarness`：工具预算（8 次）、allow-list（当前仅 `scholar.search`）、运行事件、幂等产物写入、证据落库
- 🟢 通用图骨架 `plan → context → research → draft → review(interrupt)`；后由 Stage 4 的 7 张按智能体图取代（draft 节点已接入 Fake/DeepSeek 模型）
- 🟡 model / tool / planner 节点已接入（`plan`/`research`/`draft` 节点 + Fake/DeepSeek `generate` + usage）；**剩余** DeepSeek `bind_tools`（工具调用）与流式 —— 待验证 `deepseek-v4-flash`
- 🔴 隐私守卫（`lib/privacy/sensitive-content.ts` 移植到后端）
- 🟢 `app/api/agents/[agent]/route.ts` 已有 `AGENT_RUNTIME=langgraph|legacy` 开关代理（`lib/server/agent-runtime.ts`，默认 legacy）；UI 仍走旧直连 DeepSeek 路径

### Stage 3 — MCP 客户端 + 服务端 🟡（后端就绪）

- 🟢 scholar / citations / journals 工具（`app/mcp/tools/*`：`scholar.search`/`openalex_search`/`crossref_lookup`/`semantic_scholar`/`journal_finder`）经统一注册表暴露
- 🟢 MCP 服务端（`app/mcp/server.py`，FastMCP；stdio `python -m app.mcp.server` 或 streamable HTTP）+ 客户端池（`app/mcp/pool.py`，streamable HTTP，含进程内回退）
- 🟢 SSRF 与 2 MiB 体量守卫迁移（`app/mcp/guards.py`）
- 🟢 iScholar 领域工具（`ischolar.list_projects`/`ischolar.search_bibliography`/`ischolar.manuscript_outline`，`app/mcp/tools/ischolar.py`）
- 🟢 外部 MCP 端点鉴权：`build_mcp_http_app()` 在设置 `MCP_SERVER_TOKEN` 时强制 Bearer
- 🟢 `/v1/mcp/tools` REST（签名身份 + 同意校验 `purpose='mcp_tool'` + 绑定 consent project）+ 请求体限长中间件 + BFF 代理 `app/api/mcp/[tool]`
- 🟢 `AgentHarness` 改用注册表（allow-list + 预算 + 事件保留）
- 🟢 `ischolar.*` 领域工具仅经受签名的 REST 暴露；共享 token 的独立 MCP 服务端不再暴露用户级工具
- 🔴 声明式工具映射持久化（`plugin_mcp_tools` 已判定为死代码并删除，迁移 `20260929_0012`；如未来需要须先设计安全的按用户注册表）

### Stage 4 — 迁移 7 个智能体 🟡（后端就绪）

- 🟢 `app/agents/graphs/{topic,litreview,design,data,write,submit,rebuttal}.py`（+`hermes.py`）；`build_graph_for(agent)` 按智能体分派
- 🟢 提示词复用（`app/agents/prompts.py` 移植 7 个系统提示 + 用户提示组装）
- 🟢 `contextFrom` → 图 state：从 `artifacts` 取上游已批准产物注入
- 🟢 结构化输出（`app/agents/schemas.py` 移植 Zod → Pydantic）
- 🟢 模型抽象（`app/agents/model.py`：确定性 FakeModel + DeepSeek `langchain-openai`；`AGENT_MODEL_FAKE`）
- 🟢 legacy-vs-new 奇偶校验（`tests/test_agent_parity.py`：提示词子串 + 结构化解析）
- 🟡 BFF `AGENT_RUNTIME=langgraph|legacy` 桥接已就位（`lib/server/agent-runtime.ts`，默认 legacy）；逐智能体灰度上线待续（UI 仍走旧流式链路）

### Stage 5 — 评估 harness 🟡（离线可用）

- 🟢 数据集（`services/eval/agent_eval/datasets.py`，6 例）+ 确定性检查（`checks.py`）
- 🟢 runner（离线默认 / `EVAL_MODE=live` 走 `/v1/agent`）+ 阈值 + JSON 报告 + 非零退出码
- 🟢 可选 LLM judge（`services/eval/agent_eval/judge.py`，`EVAL_JUDGE`，默认关闭）；🔴 CI 作业（无 CI 仓库；`pnpm agent:eval` 可用）

### Stage 6 — Hermes/训练/插件/清理 🟡（Hermes 图就绪）

- 🟢 对话式 Hermes 图（`app/agents/graphs/hermes.py`，经 `/v1/agent` 运行）
- 🔴 可检查点训练图
- 🟢 插件安装 / 提示词包选择按用户落 Postgres（`app/models/plugins.py` + `/v1/plugins` + BFF `app/api/plugins/[...path]`）；🟡 前端持久化已迁至 `/v1/plugins`（`lib/client/plugins.ts` + `lib/plugins/install.ts`）；🔴 声明式工具映射（死表 `plugin_mcp_tools` 已删除）与 `lib/ai/agents/*` 迁移
- 🔴 删除遗留直连 DeepSeek 路径（`app/api/agents/[agent]`、`app/api/hermes/chat`、`lib/ai/agents/index.ts`）

---

## 迁移期遗留功能状态（旧栈）

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 浏览器本地工作流 | 🟢 | 7 智能体、模块工作区、稿件/文献/实验/投稿/返修 → IndexedDB（待删除） |
| AI 科研教练（MVP） | 🟢 | 8 任务、草稿/提交、证据卡、审核、个人报告 |
| Supabase 协作训练营 | 🟢 | T1–T5 + 助教 RLS、脱敏同意、任务包、互评、证书、报表 v2、多租户、LMS/AGS（待迁移到后端的部分见 Stage 1/6） |
| 外部调用安全 | 🟢 | Agent/MCP/Hermes：鉴权、体量、限流、AI 同意证明 |
| 插件系统 | 🟡 | 新栈：安装/提示词包选择按用户落 Postgres，前端持久化（`lib/client/plugins.ts` + `lib/plugins/install.ts`）已切换；声明式 MCP 工具映射仍在 `lib/plugins/*`，待迁 Stage 6 |
| 单测 / 构建 | 🟢 | 2026-09-30：`tsc` / `lint` / `vitest`（54 文件 273 用例）/ `build` 全部通过（审计中删除 5 个死模块及其 3 个过期测试、重写 `ledger.test.ts`、新增 HMAC/代理测试） |
| Playwright E2E | 🟢 | 2026-09-27：改用 Auth.js 会话（globalSetup 播种用户 + credentials 登录）；`pnpm test:e2e` 51 通过 / 1 跳过（Supabase 协作用例需 `REAL_SUPABASE_E2E=true`）。前置：`docker compose up -d --wait postgres` |
| 后端 pytest / ruff | 🟢 | 2026-09-30：`pytest` 116/116、`ruff check` 均通过；评估 harness `ruff` 0 + `pytest` 7/7；CI 接入待补 |

---

## P0 — 重构发布前必须

- 🟢 `docker compose config` 通过；`pnpm install --frozen-lockfile` 通过
- 🟢 `pnpm docker:up` 全栈可起且健康检查通过（web/backend/worker/postgres/redis/proxy；`/v1/readyz` postgres+redis ok；Caddy/web 200）
- 🟢 `services/backend`：`ruff check && pytest` 全绿（`pytest` 116、`ruff` 0）；`services/eval` `ruff` 0、`pytest` 7、离线报告 6/6
- 🟢 Web：`pnpm lint && pnpm exec tsc --noEmit && pnpm vitest run && pnpm build` 全绿（54 文件 273 用例）
- 🟢 Alembic 迁移在 `migrate` 服务中按序应用（12 个迁移，head `20260929_0012`）；新增迁移不修改已应用版本
- 🟢 服务身份签名/过期校验有测试覆盖；`AGENT_SERVICE_TOKEN` 不出现在浏览器包
- 🟢 Auth.js Edge middleware 守卫应用路由（未登录 307 → `/login`；公开页 200）
- 🟢 compose 强制 `AUTH_SECRET` / `AGENT_SERVICE_TOKEN` / `POSTGRES_PASSWORD` 必填；后端 `ENVIRONMENT=production` 时拒绝哨兵令牌（启动期 `ValidationError`）；`AUTH_TRUST_HOST` 默认 false
- 🟡 目标环境 `DEEPSEEK_API_KEY` 等其余密钥已配置且非默认值（部署时校验）
- 🟢 `pnpm test:e2e` 全绿（51 通过 / 1 跳过；Auth.js 会话 + Postgres 播种）

## P1 — 迁移中途

> **2026-09-30 P1 执行进度（B 方案：先做 T1–T3，最后 D 阶段再翻默认；Supabase 回退随 D 删除；coach/plugin 图本轮补齐；SMTP 邀请本轮补齐）。**
> - 🟢 **后端形状补齐（T1）**：`/v1/training/programs` 增 `access`/`scope` + 嵌套 `enrollments`（含 email/displayName）；`tasks` GET 改 `{configured,rows,catalogSize,available,curriculum}`；`task-packs` GET 改 `{builtin,packs}`；组织成员列表增 `canManage` + `displayName/email/profileRole`。SQLAlchemy/ruff/pytest **117** 绿。
> - 🟢 **coach / plugin 图**：`app/agents/graphs/{training,plugin}.py`（`build_generic_graph`），移除 `/v1/agent/runs` 的 `AGENT_NOT_IMPLEMENTED` 422；pytest 覆盖。
> - 🟢 **SMTP 邀请**：无依赖 SMTP 客户端（`lib/server/smtp.ts`）+ 签名邀请 token（`lib/server/invite-token.ts`）+ `POST /api/invites` 与 `/api/invites/accept` + `/(auth)/accept-invite` 页面 + `SMTP_*` env + vitest。
> - 🟢 **训练 BFF**：`app/api/training/[...path]` 代理（catch-all 与静态路由共存，已 build 验证）。
> - 🟢 **已迁移的旧路由**（删除后走 BFF 或组件改后端）：`calendar`、`peer`、`certificates/verify`（纯透传）；`organizations` + `organizations/{id}/members`（组件改后端契约 + 走 `/api/invites` 邀请）。
> - 🟡 **剩余旧训练路由（约 16 个）**：`me`（GET/POST）、`me/certificate`、`certificates`、`programs`（GET/POST/PATCH）、`programs/{id}`、`members`、`members/{enrollmentId}`、`tasks`（PUT）、`progress`、`report`、`export`、`nudge`、`analytics/dashboard`、`lms/{link,gradebook,push}`、`task-packs`（POST 需 pack-schema→后端契约适配）、`consents`（已是后端适配器，保留）。
> - 🟡 **前端形状迁移**：15 个 `components/training/*` 仍读 Supabase snake_case（`task_id`/`latest_review`/`training_reviews`/`pack_key`…）；需改为后端 camelCase（`taskId`/`latestReview`/`reviews`/`packKey`），`me` 的 `training_programs` → `program`。
> - 🔴 **T3**：删除 `app/api/agents/[agent]`、`app/api/hermes/chat`、`app/api/agent-runs`，`module-assistant` 改走 `/v1/agent` hermes 图。
> - 🔴 **D**：翻转 `NEXT_PUBLIC_DATA_BACKEND=backend`（`lib/local/hooks.ts` 改薄 re-export）+ 删除 `lib/supabase/*`/`lib/local/*`/`@supabase/*`/`dexie`/`@huggingface/transformers`/`supabase/`/脚本/E2E spec/`NEXT_PUBLIC_COLLABORATIVE_MODE`。

- 🟡 科研核心 `/v1/data/*` 与前端 React Query 数据层（`NEXT_PUBLIC_DATA_BACKEND` 开关，默认 legacy）已就绪；1c 后端（`/v1/audit`、`/v1/realtime`）已完成；将默认切到 `backend` 并完成训练/智能体路由代理后，下线旧训练 API / `lib/local/*` / `lib/supabase/*`
- 🔴 移除 `NEXT_PUBLIC_COLLABORATIVE_MODE` 残留（`lib/supabase/collaborative.ts`、`lib/local/hooks/training.ts`、Playwright 配置）；侧栏/模块助手/模块顶栏已去 Supabase，`middleware.ts` 已换 Auth.js
- 🟢 组件层经开关 shim 迁移到 React Query（导入路径不变，`lib/local/hooks.ts` 按 `NEXT_PUBLIC_DATA_BACKEND` 解析；旧实现保留至 1c）
- 🟢 `components/agents/agent-configs.tsx` 已是 33 行 barrel（原“巨型文件”问题已解）；`lib/local/hooks.ts` 118 行，待 D 阶段替换为薄 re-export；遗留类型已抽取至 `lib/types/domain.ts`

## P2 — 产品增强

- ⚪ PWA 离线；本地数据加密；多人实时编辑（CRDT/WebRTC 或 Realtime）
- ⚪ 完整 LTI 1.3（Resource Link 启动 / OIDC、Deep Linking、NRPS 花名册同步）
- ⚪ 邀请落地页、邮件催交 webhook、审核多人指派

---

## 验证记录

- 🟢 2026-09-30（全仓审计与加固）：**P0** 工具页编译修复、旧 API（`/api/agents/[agent]`、`/api/hermes/chat`、`/api/agent-runs`）强制 Auth.js 会话（`ALLOW_LOCAL_API` 仅 dev）、BFF `%2F` 路径穿越、compose `target: prod`、生产密钥哨兵守卫；**同意统一** `ai_consents_v2`（`verifyConsent`/`verifyProgramConsent` 失败关闭、新增 `GET /v1/audit/consents/{id}`、Alembic `0010` 允许无 project、审计 UI 改读后端）；**后端鉴权/完整性** MCP `ischolar.*` IDOR、训练按组织范围（替换 `is_global_staff`）、学习者状态枚举、审计链行锁、幂等键 `UNIQUE(owner_id, idempotency_key)`（`0011`）、运行事件 advisory lock、NOTIFY 字节截断、HMAC 非 ASCII、SSRF DNS 解析、上传前置限长、CSV 公式转义、MCP 请求体中间件、删除死表 `plugin_mcp_tools`（`0012`）；**基础设施** 非 root 镜像、端口 `127.0.0.1`、Caddy TLS + 安全头、登录限流、删除 `install-release.sh`/`vercel.json`；**测试/死代码** 重写 `ledger.test.ts`、新增 HMAC 签名与代理 401 测试、删除 5 模块 + 3 过期测试。验证：后端 `pytest` 116 + `ruff` 0；评估 `pytest` 7 + `ruff` 0；前端 `tsc`/`lint`/`vitest`（54 文件 273）/`build` 绿；`docker compose config`（base + dev）通过；迁移 head `20260929_0012`。
- 🟢 2026-09-28（Stage 1c 后端）：Alembic `20260928_0007`（`audit_ledger.chain_hash`，离线 SQL 渲染通过）；`app/core/audit.py`（canonical + `compute_chain_hash` + `verify_chain`）、`app/api/v1/audit.py`（`POST /v1/audit`、`GET /v1/audit/{id}`、`/verify`、`POST /v1/audit/consents`）、`app/core/notify.py`（`pg_notify`）、`app/api/v1/realtime.py`（asyncpg LISTEN SSE，项目/训练双端点）；训练提交/评审写通知；BFF 增 `audit`/`realtime`/`vectors` 根与代理；前端抽 `lib/types/domain.ts`、`lib/client/types.ts`，新增 `lib/client/{http,audit,plugins}.ts`，插件/侧栏/模块顶栏/模块助手/提交包导出改走后端。后端 `ruff` 0、`pytest` 111；前端 `tsc`/`lint`/`vitest`（289 用例）/`build` 全绿。

- 🟢 2026-09-27（Stage 4 切换 + 5 judge + 6 插件）：`lib/server/agent-runtime.ts` + `app/api/agents/[agent]` 的 `AGENT_RUNTIME=langgraph` 分支（默认 legacy，不改变现网行为）；后端 `AGENT_REQUIRE_CONSENT` 开关；`services/eval/agent_eval/judge.py`（`EVAL_JUDGE`，默认关闭）+ runner `judge_score`；`app/models/plugins.py` + Alembic `20260927_0006` + `/v1/plugins`（安装/卸载/提示词包选择）+ BFF `app/api/plugins/[...path]`。后端 `ruff` 0、`pytest` 84，评估 `pytest` 7，`alembic heads` → `20260927_0006`
- 🟢 2026-09-27（Stage 4/5 + Hermes + MCP 收尾）：`app/agents/prompts.py`（7 系统提示 + 用户提示组装 + Hermes 提示）、`app/agents/schemas.py`（Zod→Pydantic）、`app/agents/model.py`（Fake/DeepSeek）、`app/agents/graphs/*`（7 智能体图 + hermes 图 + 注册表）、`runtime` 按智能体分派与工具 allow-list；`services/eval` 数据集/检查/runner（离线 6/6、`EVAL_MODE=live`）；MCP `ischolar.*` 工具 + `MCP_SERVER_TOKEN` 中间件；新增 `tests/test_agent_{prompts,graphs,parity}.py`、`test_mcp_*` 扩展、`services/eval/tests`。后端 `ruff` 0、`pytest` 81，评估 `pytest` 5
- 🟢 2026-09-27（Stage 3 MCP）：`app/mcp/guards.py`（`is_blocked_host`/`assert_safe_https_url`/`guarded_get_json` 2 MiB 上限/`check_body_size`）+ `app/mcp/tools/*`（`scholar.search`/`openalex_search`/`crossref_lookup`/`semantic_scholar`/`journal_finder`）+ `registry.py` + `server.py`（FastMCP）+ `pool.py`（streamable HTTP 客户端池）；`/v1/mcp/tools` REST（签名身份 + 同意校验）；`AgentHarness` 改用注册表；BFF `app/api/mcp/[tool]` 重映射为代理；新增 `tests/test_mcp_{guards,contract}.py`；后端 `ruff` 0、`pytest` 55 绿，前端 `tsc`/`lint`/`vitest`（288 用例）绿
- 🟢 2026-09-27（E2E Auth.js 适配）：新增 `e2e/helpers/credentials.ts` + `e2e/global-setup.ts`（播种 staff/learner）；`playwright.config.ts` 加 globalSetup 与 host `AUTH_DATABASE_URL`；重写 `e2e/helpers/auth.ts`（`authenticate` 走 `/api/auth/csrf` + `/api/auth/callback/credentials`）、`e2e/login.spec.ts`、`e2e/settings.spec.ts`；12 个 spec 改用 `authenticate`/`login`；`top-bar.tsx` 改用 `next-auth` `signOut`；`scripts/quality-gate.mjs` 在 e2e 前 `docker compose up -d --wait postgres`。`pnpm test:e2e` 51 通过 / 1 跳过
- 🟢 2026-09-27（Stage 1b 后端路由补齐）：新增 `/v1/training/{me,reviews,peer,analytics/dashboard,calendar,task-packs}`、`programs/{id}/{progress,report,export,certificates,consents,nudge}`、`certificates/verify`、`me/certificate`、`lms/{link,gradebook}`；移植纯逻辑 `app/training/{catalog,progress,reporting,calendar,certificate,export}.py`；`pytest` 44 绿（含 `test_training_logic.py`）、`ruff` 0。仅 AGS `lms/push` 未移植
- 🟢 2026-09-27（Stage 1b 学员/评审切片）：新增 `/v1/training/me`（报名 + `include=submissions` + 提交含同意时效/归属校验）、`/v1/training/reviews`（队列分页 + claim/review）、`/v1/training/peer`（`complete_peer_review` 事务移植 + 匿名 token）；Alembic `20260927_0005` 扩展 `ai_consents_v2` + 新增 `audit_ledger`；`ALLOWED_BACKEND_ROOTS` 加 `training`；`pytest` 35 绿、`ruff` 0，`alembic heads` → `20260927_0005`、`upgrade 0004:0005 --sql` 渲染通过
- 🟢 2026-09-27（Stage 1b 地基）：`app/models/training.py` 15 表 + `alembic/versions/20260927_0004_training_org_lms.py`（identity FK → `users(id)`，含默认组织 seed）；`app/core/authz.py` 增 `can_manage_org` / `can_read_program`；新增 `/v1/training` 路由（programs / enrollments / tasks / organizations / submissions / reviews，含 `review_training_submission` 事务移植）；`tests/test_training_contract.py` + `test_authz.py` 扩展；后端 `ruff` 0、`pytest` 32 绿；`alembic heads` → `20260927_0004`、`upgrade 0003:0004 --sql` 渲染通过
- 🟢 2026-09-27（Stage 1a 前端）：新增 `components/providers/query-provider.tsx`（挂载于 `app/layout.tsx`）、`lib/client/config.ts`、`lib/client/query-client.ts`、`lib/client/data.ts`（12 资源 CRUD + attachments multipart）、`lib/client/hooks/*`（React Query 镜像旧签名）；`lib/local/hooks.ts` 改为开关 shim；`__tests__/lib/client/{data,hooks,resolver}` 共 11 例；`tsc` / `lint` / `vitest`（55 文件 290 用例）/ `build` 全绿。默认 legacy，Docker 后端联调待开关切换后验证
- 🟢 2026-09-25（Stage 1a 完成）：科研核心 12 个 `/v1/data/*` 资源全部落地（含 blocks 快照/reorder/rollback、attachments multipart + `app/storage/blobs.py`、bib-items bulk，以及 versions/rag-chunks/experiments/submissions/review-rounds/rebuttal-items）；新增 `/v1/vectors`（embed/search/status）与 `vectors` compose profile；BFF 抽取共享 `lib/server/backend-proxy.ts`（allowlist + 穿越守卫）并新增 `/api/data/[...path]`；后端 `ruff` + `pytest`（22）绿，前端 `tsc` / `lint` / `vitest`（52 文件 279 用例）/ `build` 绿。前端 hooks 尚未切到 BFF
- 🟢 2026-09-25（Stage 1a 起步）：迁移 `20260925_0003_research_core` 应用到运行库（11 张科研表 + `projects` 客户端字段 + `owner_id`→`users(id)` FK）；projects/manuscripts/manuscript-blocks/bib-items/tasks 在容器内实测（创建/列表/更新/reorder/跨用户 404/级联删除）通过；compose 新增 `storage` 文件系统卷
- 🟢 2026-09-24（第二轮修复）：`pnpm docker:up` 全栈起且健康；`migrate` 应用 2 个 Alembic 迁移；`/v1/healthz`、`/v1/readyz` ok；web/Caddy 200；未登录访问应用路由 307 → `/login`。`middleware.ts` 替换为 Auth.js（新增 `lib/auth.config.ts`）；`vitest` 51 文件 274 用例通过；确认 `AUTH_SECRET` 非构建期必需。Docker web 镜像构建问题由 pnpm 版本固定 + `ignoredBuiltDependencies` 修复。**Stage 0 完成**
- 🟢 2026-09-24（修复后复测）：`pnpm-lock.yaml` 刷新后 `--frozen-lockfile` 通过；`tsc` / `lint` / `vitest`（50 文件 272 用例）/ `build` / 后端 `ruff` / `pytest`（7）全部通过；`docker compose config` 通过。仅 `pnpm test:e2e` 仍红（E2E 助手未适配 Auth.js）
- 🟢 2026-09-24：全栈实测（Node 22.20 / pnpm 10.31 / uv）发现 lockfile 落后、`tsc` 1、`lint` 1、`vitest` 27 失败、后端 `ruff` 27；据此新增「已知问题与阻断项」并同步 `README.md`
- 🟢 2026-09-20：`AGENTS.md` 对齐重构中架构；文档（README/TODO/`doc/*`）重写为目标架构
- 🟡 2026-09-20：Stage 0 骨架落地（compose、backend、Auth.js、Alembic、服务身份）——待容器级验证
- 🟢 2026-07-18（旧栈）：`tsc` / `lint` / `vitest` / `build` 通过；`accept:supabase` + `REAL_SUPABASE_E2E` 通过；`training-camp` E2E 绿

### 建议下一步

1. **训练前端迁移（1b/1c 剩余）**：新增 `lib/client/training.ts` + React Query 训练 hooks（camelCase），把 `components/training/**` 的 15 个直连 `/api/training/*` 组件切到后端；24 个 `app/api/training/**` 路由改 BFF 代理后删除；补齐后端形状缺口（analytics 热图/KPI、programs 嵌套 enrollments、consents 信封与分页、tasks `{rows,curriculum}`、task-packs `{builtin,packs}` 与 body、export `Content-Disposition`、LMS `format`/`ags`、reviews 字段名、org 成员姓名）。邮件邀请必须留在 web 侧（Auth.js 拥有 `users`）
2. **智能体前端迁移（Stage 2/6）**：`lib/ai/agents/{index,use-agent-run,context}.ts`、`lib/audit/ledger.ts` 改走 `/api/agent` + `/api/audit`；后端补 run 列表与 approve/reject/apply 产物评审端点、把 `consent_id` 透传到 `POST /v1/agent/runs`；默认切 `AGENT_RUNTIME=langgraph` 并删除遗留直连 DeepSeek 路径（`app/api/agents/[agent]`、`app/api/hermes/chat`）
3. **删除遗留数据层（1c 收尾）**：前端迁移完成后删除 `lib/supabase/*`、`lib/local/*`，移除 `@supabase/*`、`dexie`、`dexie-react-hooks`、`@huggingface/transformers` 依赖、`supabase/migrations/*`、Supabase 脚本与 `e2e/supabase-collaboration.spec.ts`，并清理 `NEXT_PUBLIC_COLLABORATIVE_MODE` / `NEXT_PUBLIC_SUPABASE_*` / `NEXT_PUBLIC_DATA_BACKEND`
4. Stage 2 剩余：接入 DeepSeek `bind_tools`（工具调用）与流式输出；为 `/v1/agent/*` 状态机（resume/cancel/SSE 续传/幂等）补 pytest 契约测试
5. 每次新增/修改 Alembic 迁移后同步 `doc/database.md`（迁移表已补 `0006`–`0012`，含 `ai_consents_v2.project_id` 可空、幂等键 owner 级、`plugin_mcp_tools` 删除）；`doc/architecture.md` 的同意/审计段落已在 2026-09-30 更新为 `ai_consents_v2` + 项目级行锁；若仍有 `/v1/vectors` 或未落科研实体的旧表述，一并订正

## 文档维护清单

| 文档 | 用途 |
| --- | --- |
| `doc/architecture.md` | web/backend 分层、服务身份、LangGraph、数据流 |
| `doc/database.md` | Alembic 迁移、Postgres 表、auth 表、pgvector；附录含旧 Dexie/Supabase |
| `doc/development.md` | 环境、命令、服务边界、添加智能体、i18n/主题 |
| `doc/deployment.md` | Docker Compose、Caddy/HTTPS、环境变量、迁移 |
| `doc/usage.md` / `doc/examples.md` | 用户路径与智能体输入/输出示例 |
| `doc/plugins.md` / `doc/lms.md` / `doc/training-packs.md` | 专项功能说明 |
| `IMPLEMENTATION_PLAN.md` / `README.md` / `AGENTS.md` | 权威路线图 / 入口说明 / AI 助理指引 |

---

*本文件反映仓库实现状态，其阶段勾选比 `IMPLEMENTATION_PLAN.md` 更及时；锁定决策与总方向仍以 `IMPLEMENTATION_PLAN.md` 为准。*
