# TODO.md — iScholar v6.0 路线图

> 最近更新：2026-09-24  
> 状态标记：🔴 未开始 | 🟡 进行中 | 🟢 已完成 | ⚪ 可选增强  
> **权威路线图是 [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md)**（记录锁定决策与阶段状态）；本文件面向工程执行，跟踪细化任务与验证记录。  
> **2026-09-24：Stage 0 完成。** `pnpm docker:up` 全栈健康、`migrate` 应用迁移、`/v1/readyz` ok；`middleware.ts` 已替换为 Auth.js Edge middleware；`tsc` / `lint` / `vitest`（51 文件 274 用例）/ `build` / 后端 `ruff` / `pytest` 全绿。仅 `pnpm test:e2e` 仍红——E2E 助手仍走已移除的本地密码鉴权，需改用 Auth.js 会话。详见「已知问题与阻断项」。

---

## 当前状态

平台正在从「浏览器本地（Dexie/IndexedDB）+ 可选 Supabase」迁移到**全 Docker 平台**（Next.js BFF + Python FastAPI/LangGraph + PostgreSQL/pgvector + Redis + Caddy）。旧栈仍在运行，按阶段逐步删除。

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| Stage 0 · Docker + Postgres + Auth | 🟢 完成 | 全栈 Docker 起且健康（web/backend/worker/postgres/redis/proxy）；backend 切片、HMAC 服务身份、Auth.js（`lib/auth.ts` + Edge-safe `lib/auth.config.ts` + `middleware.ts`）、`db/init` auth 表、Alembic 2 迁移；`ruff`/`pytest`/`tsc`/`lint`/`vitest`/`build` 全绿 |
| Stage 1 · 后端数据 API | 🟡 进行中（1a） | 拆分为 1a/1b/1c；1a 已完成科研核心 schema + 5 个 `/v1/data` 资源（实测 CRUD/404/级联）+ authz 策略 + 存储卷；剩余 versions/attachments/vectors/BFF/前端 hooks |
| Stage 2 · Agent 运行时核心 | 🟡 后端切片已就位 | 后端已有 durable run API（threads/runs/SSE 事件流/resume/cancel）、`AgentHarness`、LangGraph + Postgres checkpointer、worker；**剩余**：DeepSeek 模型节点（`bind_tools`/流式）、`app/api/agents/[agent]` 的 `AGENT_RUNTIME` 切换 |
| Stage 3 · MCP 客户端 + 服务端 | 🔴 未开始 | 真实 MCP、SSRF/体量守卫 |
| Stage 4 · 迁移 7 个智能体 | 🔴 未开始 | 每智能体一张图、legacy-vs-new 奇偶校验 |
| Stage 5 · 评估 harness | 🔴 未开始 | 数据集、确定性检查、LLM judge、CI 阈值 |
| Stage 6 · Hermes/训练/插件/清理 | 🔴 未开始 | 训练图、Postgres 插件、删除遗留直连 DeepSeek 路径 |
| 旧栈功能（迁移期仍在线） | 🟢/🟡 | 7 智能体、模块外壳、训练营、插件、单测/构建见下 |

---

## 已知问题与阻断项（2026-09-24 两轮实测 → 已修复）

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
| 12 | `pnpm test:e2e` | 🔴 仍红（遗留迁移缺口） | E2E 助手仍写 `ischolar_auth_*` 本地存储，而 `app/(app)/layout.tsx` 已改由 `/api/auth/session`（Auth.js）鉴权 → 认证态用例被重定向到 `/login`。需为 E2E 提供 Auth.js 会话（Postgres 播种用户）并重写 `e2e/helpers/auth.ts` 与 `e2e/login.spec.ts` |

> `docker compose config` 通过。E2E 浏览器二进制已安装（`playwright install chromium-headless-shell`）。Docker 栈当前保持运行。

---

## 迁移任务（按 Stage）

### Stage 0 — Docker + Postgres + Auth 🟡

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

切换方式：`NEXT_PUBLIC_DATA_BACKEND=legacy|backend`，逐功能切换，遗留路径在 parity 后删除。

#### 1a — 科研核心 🟡
- 🟢 科研核心 SQLAlchemy 模型（`app/models/research.py`：manuscripts/blocks/versions/bib_items/attachments/rag_chunks/experiments/submissions/review_rounds/rebuttal_items/tasks）+ `projects` 客户端字段
- 🟢 Alembic `20260925_0003_research_core`：建表 + `projects` 扩展 + `owner_id` → `users(id)` FK（已应用到运行库）
- 🟢 授权策略 `app/core/authz.py`（owner/staff/org/program 纯函数）+ pytest parity（`tests/test_authz.py`）
- 🟢 `/v1/data` 包：`projects`、`manuscripts`、`manuscript-blocks`（含 reorder）、`bib-items`（含 bulk）、`tasks`；camelCase 收发；跨用户 404（已容器内实测 CRUD + 级联删除）
- 🟢 文件系统存储卷（compose `storage` + `STORAGE_DIR`）已接入 compose/env
- 🔴 剩余科研实体路由：`manuscript-versions`、`attachments`（multipart 上传/下载）、`rag-chunks`、`experiments`、`submissions`、`review-rounds`、`rebuttal-items`
- 🔴 向量：`/v1/vectors` + 服务端嵌入（`sentence-transformers`，`bib_items`/`rag_chunks.embedding` 列已就绪）
- 🔴 BFF：扩展 `app/api/agent/[...path]` 支持 `PUT/PATCH/DELETE`，新增 `app/api/data/[...path]`
- 🔴 前端：引入 React Query provider + `lib/client/data.ts`，迁移科研 hooks（`lib/local/hooks/*`）

#### 1b — 训练 / 组织 / LMS 🔴
- 🔴 训练/组织/LMS 表模型 + Alembic `0004`
- 🔴 24 个 `app/api/training/**` 路由改 BFF 代理；角色守卫移植（staff/program-staff/staff-or-TA/reviewer/org-staff）
- 🔴 移植 RPC（`review_training_submission`、`complete_peer_review`）与 AGS 推送/成绩册
- 🔴 SMTP 邀请邮件（web BFF 拥有 `users`；新增 `nodemailer` + `SMTP_*`）
- 🔴 迁移训练 hooks/组件；运营更新先用轮询

#### 1c — 同意/审计、实时、插件、清理 🔴
- 🔴 同意 + 哈希链审计落 Postgres
- 🔴 实时 `LISTEN/NOTIFY` → SSE
- 🔴 插件按用户落 Postgres
- 🔴 删除 `lib/supabase/*`、`lib/local/*`，无残留 `@supabase/*` / `dexie`

### Stage 2 — Agent 运行时核心 🟡

- 🟢 Postgres checkpointer（`langgraph-checkpoint-postgres`，`AsyncPostgresSaver`）
- 🟢 `/v1/agent/threads` + `/v1/agent/runs` + `/resume` + `/cancel` + `/events`（SSE，可断线续传）
- 🟢 `AgentHarness`：工具预算（8 次）、allow-list（当前仅 `scholar.search`）、运行事件、幂等产物写入、证据落库
- 🟢 单张通用图 `plan → research → draft → review(interrupt)`；仅 Crossref 工具，无模型调用
- 🔴 model / tool / planner 节点（DeepSeek `bind_tools` / streaming / usage）—— 待验证 `deepseek-v4-flash`
- 🔴 隐私守卫（`lib/privacy/sensitive-content.ts` 移植到后端）
- 🔴 `app/api/agents/[agent]/route.ts` 以 `AGENT_RUNTIME=langgraph|legacy` 开关代理；当前 UI 仍走旧直连 DeepSeek 路径

### Stage 3 — MCP 客户端 + 服务端 🔴

- 🔴 scholar / citations / journals / iScholar 工具的 MCP server
- 🔴 MCP 客户端池 + iScholar MCP 服务端端点
- 🔴 SSRF 与 2 MiB 体量守卫迁移

### Stage 4 — 迁移 7 个智能体 🔴

- 🔴 `graphs/{topic,litreview,design,data,write,submit,rebuttal}.py`
- 🔴 提示词复用；`contextFrom` → 图 state / 检索
- 🔴 legacy-vs-new 奇偶校验 harness；按智能体分批上线

### Stage 5 — 评估 harness 🔴

- 🔴 数据集、确定性检查、LLM judge、阈值
- 🔴 `pnpm agent:eval`；CI 作业产出评估报告

### Stage 6 — Hermes/训练/插件/清理 🔴

- 🔴 对话式 + 可检查点训练图
- 🔴 插件：agent / 提示词包 / 声明式工具映射
- 🔴 删除遗留直连 DeepSeek 路径

---

## 迁移期遗留功能状态（旧栈）

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 浏览器本地工作流 | 🟢 | 7 智能体、模块工作区、稿件/文献/实验/投稿/返修 → IndexedDB（待删除） |
| AI 科研教练（MVP） | 🟢 | 8 任务、草稿/提交、证据卡、审核、个人报告 |
| Supabase 协作训练营 | 🟢 | T1–T5 + 助教 RLS、脱敏同意、任务包、互评、证书、报表 v2、多租户、LMS/AGS（待迁移到后端的部分见 Stage 1/6） |
| 外部调用安全 | 🟢 | Agent/MCP/Hermes：鉴权、体量、限流、AI 同意证明 |
| 插件系统 | 🟢 | Agent / 提示词包 / 声明式 MCP（`lib/plugins/*`、Settings、`doc/plugins.md`）；目标改 Postgres 按用户存储 |
| 单测 / 构建 | 🟢 | 2026-09-24 修复后：`tsc` / `lint` / `vitest`（272 用例）/ `build` 全部通过 |
| Playwright E2E | 🔴 | 2026-09-24 复跑：浏览器二进制缺失已修复；用例仍失败——E2E 助手走已移除的本地密码鉴权，需改用 Auth.js 会话（见「已知问题与阻断项」#8） |
| 后端 pytest / ruff | 🟢 | `pytest` 7/7、`ruff check` 均通过；CI 接入待补 |

---

## P0 — 重构发布前必须

- 🟢 `docker compose config` 通过；`pnpm install --frozen-lockfile` 通过
- 🟢 `pnpm docker:up` 全栈可起且健康检查通过（web/backend/worker/postgres/redis/proxy；`/v1/readyz` postgres+redis ok；Caddy/web 200）
- 🟢 `services/backend`：`ruff check && pytest` 全绿（`pytest` 7、`ruff` 0）
- 🟢 Web：`pnpm lint && pnpm exec tsc --noEmit && pnpm vitest run && pnpm build` 全绿
- 🟢 Alembic 迁移在 `migrate` 服务中按序应用（2 个迁移）；新增迁移不修改已应用版本
- 🟢 服务身份签名/过期校验有测试覆盖；`AGENT_SERVICE_TOKEN` 不出现在浏览器包
- 🟢 Auth.js Edge middleware 守卫应用路由（未登录 307 → `/login`；公开页 200）
- 🟡 目标环境 `DEEPSEEK_API_KEY` / `AUTH_SECRET` / `AGENT_SERVICE_TOKEN` 已配置且非默认值
- 🔴 `pnpm test:e2e` 全绿（需先为 E2E 提供 Auth.js 会话）

## P1 — 迁移中途

- 🔴 Stage 1 数据 API 与训练路由代理；旧训练 API 与 `lib/supabase/*` 同步下线
- 🔴 移除 `NEXT_PUBLIC_COLLABORATIVE_MODE` 残留（`lib/supabase/collaborative.ts`、`lib/local/hooks/training.ts`、Playwright 配置）；`middleware.ts` 的 Supabase 逻辑已替换为 Auth.js
- 🔴 组件层从 `lib/local/hooks` 迁移到 React Query（必要时用 shim 过渡）
- 🔴 `components/agents/agent-configs.tsx`、`lib/local/hooks.ts` 巨型文件随迁移拆分

## P2 — 产品增强

- ⚪ PWA 离线；本地数据加密；多人实时编辑（CRDT/WebRTC 或 Realtime）
- ⚪ 完整 LTI 1.3（Resource Link 启动 / OIDC、Deep Linking、NRPS 花名册同步）
- ⚪ 邀请落地页、邮件催交 webhook、审核多人指派

---

## 验证记录

- 🟢 2026-09-25（Stage 1a）：迁移 `20260925_0003_research_core` 应用到运行库（11 张科研表 + `projects` 客户端字段 + `owner_id`→`users(id)` FK）；`/v1/data` 的 projects/manuscripts/manuscript-blocks/bib-items/tasks 在容器内实测（创建/列表/更新/reorder/跨用户 404/级联删除）通过；后端 `ruff` + `pytest`（18）绿；compose 新增 `storage` 文件系统卷
- 🟢 2026-09-24（第二轮修复）：`pnpm docker:up` 全栈起且健康；`migrate` 应用 2 个 Alembic 迁移；`/v1/healthz`、`/v1/readyz` ok；web/Caddy 200；未登录访问应用路由 307 → `/login`。`middleware.ts` 替换为 Auth.js（新增 `lib/auth.config.ts`）；`vitest` 51 文件 274 用例通过；确认 `AUTH_SECRET` 非构建期必需。Docker web 镜像构建问题由 pnpm 版本固定 + `ignoredBuiltDependencies` 修复。**Stage 0 完成**
- 🟢 2026-09-24（修复后复测）：`pnpm-lock.yaml` 刷新后 `--frozen-lockfile` 通过；`tsc` / `lint` / `vitest`（50 文件 272 用例）/ `build` / 后端 `ruff` / `pytest`（7）全部通过；`docker compose config` 通过。仅 `pnpm test:e2e` 仍红（E2E 助手未适配 Auth.js）
- 🟢 2026-09-24：全栈实测（Node 22.20 / pnpm 10.31 / uv）发现 lockfile 落后、`tsc` 1、`lint` 1、`vitest` 27 失败、后端 `ruff` 27；据此新增「已知问题与阻断项」并同步 `README.md`
- 🟢 2026-09-20：`AGENTS.md` 对齐重构中架构；文档（README/TODO/`doc/*`）重写为目标架构
- 🟡 2026-09-20：Stage 0 骨架落地（compose、backend、Auth.js、Alembic、服务身份）——待容器级验证
- 🟢 2026-07-18（旧栈）：`tsc` / `lint` / `vitest` / `build` 通过；`accept:supabase` + `REAL_SUPABASE_E2E` 通过；`training-camp` E2E 绿

### 建议下一步

1. 修复 E2E：为 Playwright 提供 Auth.js 会话（Postgres 播种用户 + credentials 登录），重写 `e2e/helpers/auth.ts` 与 `e2e/login.spec.ts`，再复跑 `pnpm test:e2e`
2. 启动 Stage 1：把 `projects` 之外的领域表与 `/v1/data/*` 落到 Python；25 个 `app/api/training/**` 路由改 BFF 代理
3. 为 `/v1/agent/*` 状态机（resume/cancel/SSE 续传/幂等）补 pytest 契约测试
4. 启动 Stage 2 剩余：接入 DeepSeek `bind_tools`，再实现 `AGENT_RUNTIME` 切换
5. 每次新增/修改 Alembic 迁移后同步 `doc/database.md`

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

*本文件反映仓库实现状态；阶段权威状态以 `IMPLEMENTATION_PLAN.md` 为准。*
