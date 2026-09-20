# iScholar v6.0 — 系统架构

> 本文档描述**目标架构**：全 Docker 平台，Next.js 薄 BFF + Python FastAPI/LangGraph 后端 + PostgreSQL/pgvector + Redis + Caddy。
>
> ⚠️ **重构进行中（Stage 0）。** 旧栈（Dexie/IndexedDB + Supabase）仍在部分代码中运行，见文末[附录 A](#附录-a历史架构迁移中)。
>
> 权威阶段状态见 [`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md)；数据库细节见[数据库结构说明](./database.md)；部署见[部署指南](./deployment.md)。

---

## 目录

1. [系统概述](#1-系统概述)
2. [总体架构](#2-总体架构)
3. [服务边界与目录](#3-服务边界与目录)
4. [Web 层（Next.js BFF）](#4-web-层nextjs-bff)
5. [后端服务（FastAPI）](#5-后端服务fastapi)
6. [Agent 运行时（LangGraph + Harness）](#6-agent-运行时langgraph--harness)
7. [数据层](#7-数据层)
8. [API 契约](#8-api-契约)
9. [MCP](#9-mcp)
10. [前端组件 / 状态 / i18n / 主题](#10-前端组件--状态--i18n--主题)
11. [测试](#11-测试)
12. [构建与部署](#12-构建与部署)
13. [迁移策略与已知问题](#13-迁移策略与已知问题)
14. [附录](#附录)

---

## 1. 系统概述

iScholar v6.0 是一个 **AI-native 学术研究平台**。目标架构中，系统由**一个 Next.js 薄 BFF** 与**一个 Python 后端服务**组成，所有领域数据存储在自有 PostgreSQL，Agent 由 LangGraph 持久化执行。

### 1.1 设计原则

1. **单一数据所有权**：Python 后端拥有全部领域表；web 只直连 auth 表。
2. **身份签名，永不裸信**：web 对用户身份签名后转发，后端校验 HMAC 与时间窗。
3. **持久化 Agent**：LangGraph 图 + Postgres checkpointer，运行可恢复、可审批、可取消。
4. **薄 BFF**：Next.js 不承载业务规则，只做认证、签名、代理与渲染。
5. **可观测 / 可审计**：运行事件、审计链与产物均落库。
6. **全 Docker 可复现**：本地与生产使用同一 compose 拓扑。

### 1.2 技术栈

| 层面 | 技术 | 用途 |
| --- | --- | --- |
| Web 框架 | Next.js 14.2（App Router） | 渲染 + BFF + Auth.js 路由 |
| 语言（web） | TypeScript（strict） | 前端与 BFF |
| Web 认证 | Auth.js（NextAuth v5）+ `pg` | Credentials + Postgres `users` |
| BFF 代理 | `app/api/agent/[...path]` + `lib/server/backend.ts` | 签名转发到后端 |
| 后端框架 | FastAPI + Uvicorn | `/v1/*` API |
| 语言（后端） | Python 3.12 | 领域逻辑与 Agent 运行时 |
| ORM / 驱动 | SQLAlchemy 2 (async) + asyncpg | 领域数据访问 |
| 迁移 | Alembic | 领域 schema 唯一来源 |
| Agent 运行时 | LangGraph + langgraph-checkpoint-postgres | 持久化图执行 |
| LLM | langchain-openai → DeepSeek | `deepseek-v4-flash`（回退 `deepseek-chat`） |
| 数据库 | PostgreSQL 16 + pgvector | 领域数据 + 向量 |
| 缓存 / 限流 / 事件 | Redis 7 | 限流、pub/sub |
| 反向代理 | Caddy 2 | TLS + SSE 反缓冲 |
| UI | React 18 + Tailwind 3 + shadcn/ui（Radix） | 组件层 |
| 状态 | Zustand（locale）+ TanStack Query | 全局状态 + 异步缓存 |
| 富文本 | Tiptap + KaTeX | 论文撰写 |
| 测试 | Vitest + Playwright（web）、pytest（后端） | 单元 / E2E |

---

## 2. 总体架构

### 2.1 拓扑

```text
浏览器
  │  Auth.js 会话（JWT，携带 user id + role）
  ▼
web（Next.js + Auth.js，薄 BFF）
  │  1) auth() 解析会话   2) HMAC 签名身份   3) 转发到私有后端
  │     X-IScholar-User / -Timestamp / -Signature
  ▼
backend（Python FastAPI，单一镜像）
  ├ /v1/healthz  /v1/readyz     健康检查（compose healthcheck 打 /v1/healthz）
  ├ /v1/me                      校验签名身份
  ├ /v1/data/*                  领域 CRUD + 授权
  ├ /v1/agent/*                 LangGraph 图 + harness + checkpointer + SSE 事件
  ├ /v1/mcp/*                   MCP 客户端池 + MCP 服务端（Stage 3）
  ├ /v1/audit/*                 SHA-256 审计链（Stage 1+）
  └ /v1/vectors/*               pgvector 检索 + 嵌入（Stage 1+）
  │
  ├── PostgreSQL 16 + pgvector  领域表（后端所有）+ auth 表（web 所有）
  ├── Redis 7                   限流 / pub-sub / 队列
  └── DeepSeek API              经 langchain-openai bind_tools

worker（python -m app.worker）  后台队列消费（同一后端镜像）
eval（--profile eval）          评估 harness（Stage 5 骨架）
proxy（Caddy）                  80/443 终止 TLS，转发 web，SSE 反缓冲
```

### 2.2 分层职责

```text
┌───────────────────────────────────────────────────────────┐
│ 浏览器：页面 + 组件（React Query 读取 BFF）                  │
├───────────────────────────────────────────────────────────┤
│ web（BFF）：Auth.js 会话、HMAC 签名、/api/agent 代理、渲染   │
├───────────────────────────────────────────────────────────┤
│ backend：领域 CRUD、授权、LangGraph 运行时、MCP、审计、向量   │
├───────────────────────────────────────────────────────────┤
│ PostgreSQL(pgvector) · Redis                              │
└───────────────────────────────────────────────────────────┘
```

### 2.3 一次 Agent 运行的数据流

```text
用户输入 → AgentPageTemplate → useAgentRun / React Query
  │
  ├─ POST /api/agent/agent/threads          （可选，创建线程）
  ├─ POST /api/agent/agent/runs             （带 Idempotency-Key）
  │     └─ web BFF：auth() → 签名 → fetch(BACKEND_INTERNAL_URL)
  │           └─ backend：require_identity → 校验 consent → 落 AgentRun(queued)
  │                 └─ worker/runtime 执行 LangGraph → AgentHarness 落事件/产物
  ├─ GET  /api/agent/agent/runs/{id}/events → SSE（after=sequence，可断线续传）
  ├─ 审批/补充 → POST .../resume             → 状态回到 queued 继续
  └─ 取消     → POST .../cancel              → cancel_requested
```

---

## 3. 服务边界与目录

```text
app/                                # Next.js App Router
├── (auth)/login/                   # Auth.js 登录页
├── (app)/                          # 认证后主应用
│   ├── layout.tsx                  # isModuleRoute → 全屏外壳 vs 侧栏+顶栏
│   ├── dashboard/ projects/ settings/ tools/ training/
├── api/
│   ├── auth/[...nextauth]/route.ts # Auth.js handlers
│   ├── agent/[...path]/route.ts    # ★ 签名薄代理 → 后端 /v1/*
│   └── …                           # 遗留：agents / mcp / hermes / training
components/                          # UI 层（见第 10 节）
lib/
├── auth.ts  auth/{users,password}.ts
├── server/
│   ├── backend.ts                  # ★ backendIdentityHeaders() / backendUrl()
│   └── request-guards.ts           # 遗留 API 守卫（consentProof 等）
├── ai/  local/  supabase/  mcp/  audit/  plugins/  training/  privacy/  pdf/
services/
├── backend/
│   ├── app/main.py                 # FastAPI 入口 + CORS + lifespan
│   ├── app/api/v1/                 # health · me · data · agent
│   ├── app/core/                   # config · db · security · authz
│   ├── app/agents/                 # graph · harness · runtime · tools
│   ├── app/models/domain.py        # SQLAlchemy 模型
│   ├── app/worker.py               # worker 入口
│   └── alembic/versions/           # ★ 领域 schema 迁移
└── eval/
db/init/                            # Postgres 初始化 SQL（扩展 + auth 表）
docker/web.Dockerfile               # web standalone 镜像
proxy/Caddyfile                     # 反代 + TLS + SSE
docker-compose.yml / .dev.yml
```

**边界规则**：

- web **不得**直接读写领域表；一律经 `/v1/*`。
- 后端**不得**写 auth 表（`users` / `accounts` / `verification_token`）。
- 浏览器**不得**看到 `AGENT_SERVICE_TOKEN` / `BACKEND_INTERNAL_URL` / `DEEPSEEK_API_KEY` / `AUTH_SECRET`。

---

## 4. Web 层（Next.js BFF）

### 4.1 认证（Auth.js）

`lib/auth.ts` 配置 Auth.js：Credentials provider，邮箱/密码校验 `users` 表；JWT 会话携带 `user.id` 与 `role`。`lib/auth/users.ts` 用窄连接池（`AUTH_DATABASE_URL`）只查询 auth 表。

```ts
// lib/auth.ts（要点）
session: { strategy: "jwt" }
callbacks.jwt      → token.uid / token.role
callbacks.session  → session.user.id / role
pages: { signIn: "/login" }
```

路由处理器位于 `app/api/auth/[...nextauth]/route.ts`。

### 4.2 服务身份签名

`lib/server/backend.ts` 为当前会话生成签名头：

```ts
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac("sha256", AGENT_SERVICE_TOKEN)
  .update(`${userId}:${timestamp}`).digest("hex");
return {
  "X-IScholar-User": userId,
  "X-IScholar-Timestamp": timestamp,
  "X-IScholar-Signature": signature,
};
```

### 4.3 薄代理

`app/api/agent/[...path]/route.ts` 是唯一指向新后端的通道：

- 强制 `runtime = "nodejs"`、`dynamic = "force-dynamic"`
- 未认证 → `401 { ok:false, error:"UNAUTHENTICATED" }`
- 转发 `content-type` / `idempotency-key` / `last-event-id` 头
- `POST`/`GET` 透传响应流（支持 SSE）

### 4.4 数据获取

目标使用 **TanStack React Query** 读取 `/api/agent/*`（经 BFF），缓存与失效策略在 hooks 中声明。迁移期组件仍大量使用遗留的 `lib/local/hooks`（Dexie `useLiveQuery`），按 Stage 1 逐步替换。

---

## 5. 后端服务（FastAPI）

### 5.1 入口与应用

`services/backend/app/main.py`：创建 `FastAPI`、注册 CORS（`cors_origins`）、`include_router(api_router, prefix="/v1")`，`lifespan` 关闭时 `engine.dispose()`。

### 5.2 配置

`app/core/config.py`（pydantic-settings，读取 `.env`）：

| 设置 | 默认 | 说明 |
| --- | --- | --- |
| `database_url` | `postgresql+asyncpg://…` | 后端领域库 |
| `redis_url` | `redis://…` | 限流 / pub-sub |
| `cors_origins` | `http://localhost:3000` | 逗号分隔白名单 |
| `agent_service_token` | `dev-insecure-change-me` | 服务身份签名密钥 |
| `deepseek_api_key` / `_api_url` / `_model` | `…` / `api.deepseek.com` / `deepseek-v4-flash` | 模型调用 |
| `environment` | `development` | 生产判断 |

### 5.3 安全（服务身份）

`app/core/security.py`：

- `require_identity` 依赖：要求三个签名头齐全，时间戳为整数且在 ±300s 内，`hmac.compare_digest` 校验签名，失败分别返回 `401 MISSING_SERVICE_IDENTITY` / `INVALID_SERVICE_TIMESTAMP` / `STALE_SERVICE_SIGNATURE` / `INVALID_SERVICE_SIGNATURE`。
- `sign_identity()` 供测试与 web 侧对齐构造签名。

### 5.4 路由一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/v1/healthz` | 存活；compose healthcheck 唯一入口 |
| GET | `/v1/readyz` | 就绪（依赖可用性） |
| GET | `/v1/me` | 返回校验后的 `{ userId }` |
| GET/POST | `/v1/data/projects` | 项目列表 / 创建（其余领域 API 同此授权模式） |
| POST | `/v1/agent/threads` | 创建线程 |
| POST | `/v1/agent/runs` | 创建运行（`Idempotency-Key`） |
| GET | `/v1/agent/runs/{id}` | 运行详情（含产物） |
| POST | `/v1/agent/runs/{id}/resume` | 审批 / 补充后恢复 |
| POST | `/v1/agent/runs/{id}/cancel` | 取消 |
| GET | `/v1/agent/runs/{id}/events` | SSE 事件流（`?after=<sequence>`） |

### 5.5 授权模式

所有领域查询按签名身份解析出的 `owner_id` 过滤（如 `owned_project` / `owned_run` 辅助函数），不匹配返回 `404 *_NOT_FOUND`。后续 Stage 1 将引入组织 / 训练营的细粒度授权（`app/core/authz.py`)。

### 5.6 审计与同意

- **同意**：创建运行需要与项目/用户匹配、`redaction_confirmed=true` 的 `ai_consents` 记录，且包含 `crossref`（外部检索）才放行，否则 `403 EXTERNAL_AI_CONSENT_REQUIRED`。
- **审计**：SHA-256 哈希链，记录 agent 运行、审批、应用等动作（Stage 1 迁入后端 `audit` 表）。

---

## 6. Agent 运行时（LangGraph + Harness）

### 6.1 运行状态机

`AgentRun.status` 取值（`app/models/domain.py`）：

```text
queued → running → succeeded
                 → failed
                 → cancelled
queued/running → waiting_for_input ──resume──► queued
                 waiting_for_review ──resume──► queued
```

`cancel_requested` 为协作式取消标志；`resume_input` 保存审批/补充数据。

### 6.2 AgentHarness

`app/agents/harness.py` 是**所有图节点唯一的副作用出口**：

- `emit(type, data)`：按 `run_id` 递增 `sequence` 写 `agent_run_events`
- `ensure_active()`：检测 `cancel_requested` 并抛 `RunCancelled`
- `call_tool(name, **args)`：校验工具白名单与 `max_tool_calls` 预算，落 `tool.started/completed/failed`
- `persist_evidence()`：写 `evidence`
- `save_draft(project_id, kind, content)`：以 `sha256(run_id:kind:payload)` 为幂等键写 `artifacts`，重试不重复落库

> 图节点**不得**直接写领域表；一律经 harness，以保证预算、权限、事件与幂等。

### 6.3 图与运行时

- `app/agents/graph.py`：图定义（Stage 2 起按智能体拆分 `graphs/{topic,litreview,…}.py`）
- `app/agents/runtime.py`：执行编排（`execute_run`）
- `app/agents/tools.py`：内置工具表 `BUILTIN_TOOLS`
- `app/worker.py`：后台消费等待中的运行

### 6.4 事件流

`GET /v1/agent/runs/{id}/events` 返回 `text/event-stream`：

```text
id: <sequence>
event: <type>
data: <json>

: keepalive
```

运行进入 `succeeded/failed/cancelled` 时推送 `event: end`。客户端可用 `after=<sequence>` 断线续传。响应头含 `Cache-Control: no-cache`、`X-Accel-Buffering: no`。

---

## 7. 数据层

### 7.1 PostgreSQL + pgvector

- 单库承载 **auth 表**（web 拥有）与 **领域表**（后端拥有）。
- `db/init/*.sql` 在容器首次初始化时执行：扩展（`pgcrypto` / `citext` / `vector` 等）+ auth 表。
- 领域 schema 由 **Alembic** 管理；compose 的 `migrate` 服务在 backend/worker 启动前执行 `alembic upgrade head`。
- 向量检索用 pgvector + 服务端嵌入（Stage 1+）。

详见[数据库结构说明](./database.md)。

### 7.2 核心领域模型（当前）

| 表 | 关键字段 | 用途 |
| --- | --- | --- |
| `projects` | `owner_id`, `name`, `updated_at` | 研究项目（其余领域表的根） |
| `ai_consents_v2` | `project_id`, `owner_id`, `external_services[]`, `redaction_confirmed` | 外部服务同意 |
| `agent_threads` | `project_id`, `owner_id`, `title` | 会话线程 |
| `agent_runs_v2` | `thread_id`, `owner_id`, `agent`, `goal`, `input`, `status`, `idempotency_key` | 运行 |
| `agent_run_events` | `run_id`, `sequence`, `type`, `data` | 运行事件（SSE 来源） |
| `artifacts` | `run_id`, `kind`, `status`, `content`, `idempotency_key` | 幂等产物（稿件草稿等） |
| `evidence` | `run_id`, `title`, `source_url`, `doi`, `verified` | 证据 |

### 7.3 数据生命周期

```text
创建运行 → queued → worker 领取 → running
  ├─ 需要外部检索：校验 ai_consents（含 crossref）→ harness.call_tool
  ├─ 需要用户输入/审批：waiting_for_input / waiting_for_review → resume
  └─ 完成：succeeded，写 artifacts + evidence + 事件
删除项目 → 级联删除线程/运行/事件/产物/证据（ON DELETE CASCADE）
```

---

## 8. API 契约

### 8.1 约定

- 成功：`{ "ok": true, "data": … }`；分页/列表同样包裹 `data`。
- 失败：HTTP 状态码 + `{ "detail": "ERROR_CODE" }`（FastAPI `HTTPException`）。
- 服务身份头必填（除 `/v1/healthz`、`/v1/readyz`）。
- 前端经 BFF 访问，路径前缀为 `/api/agent`（转发到后端 `/v1`），例如：
  `POST /api/agent/agent/runs` → `POST {BACKEND_INTERNAL_URL}/v1/agent/runs`。

### 8.2 关键错误码

| 错误码 | 状态 | 含义 |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | BFF 无 Auth.js 会话 |
| `MISSING_SERVICE_IDENTITY` | 401 | 缺少签名头 |
| `STALE_SERVICE_SIGNATURE` | 401 | 签名超出 ±300s |
| `INVALID_SERVICE_SIGNATURE` | 401 | HMAC 不匹配 |
| `INVALID_SERVICE_USER` | 401 | 用户 id 非 UUID |
| `PROJECT_NOT_FOUND` / `THREAD_NOT_FOUND` / `RUN_NOT_FOUND` | 404 | 非本人或不存在 |
| `EXTERNAL_AI_CONSENT_REQUIRED` | 403 | 缺同意证明或未勾选脱敏 |
| `RUN_NOT_WAITING` | 409 | 非等待态不可 resume |
| `RUN_ALREADY_FINISHED` | 409 | 已终态不可 cancel |
| `TOOL_NOT_ALLOWED` / `TOOL_BUDGET_EXCEEDED` / `TOOL_FAILED` | — | harness 抛出 |

---

## 9. MCP

目标（Stage 3）：

- **客户端池**：Python MCP 客户端连接 scholar / citations / journals / iScholar 工具服务。
- **服务端**：iScholar 暴露自身 MCP 端点，供外部编排。
- **守卫**：SSRF（仅 HTTPS、禁私有主机）与 2 MiB 体量上限从旧实现迁移。
- **同意**：外部工具调用仍需 `consentProof`（`consentId`）。

迁移期旧实现：`lib/mcp/gateway.ts`（工具注册表）+ `app/api/mcp/[tool]/route.ts`（进程内学术检索代理）。

---

## 10. 前端组件 / 状态 / i18n / 主题

> 本节描述在重构中**保持稳定**的前端约定。

### 10.1 条件布局

`app/(app)/layout.tsx` 用 `isModuleRoute(pathname)` 判断：`/projects/{id}/{agentSlug}` 渲染**全屏模块外壳**（`components/module/`），其余页面保留侧栏 + 顶栏。

### 10.2 模块工作区

`components/module/` 提供全屏外壳：`ModuleTopBar`（固定）+ `WorkflowStepper`（8 节点）+ 状态栏 + 独立滚动内容区 + `UserManual`。`AgentPageTemplate` 渲染各智能体页，行为定义在 `components/agents/agent-configs.tsx` 与 `components/agents/configs/<agent>/`。

### 10.3 8 阶段强调色

`components/module/stages.ts` 的每阶段强调色是**完整静态 Tailwind 类字符串**（`text-cyan-400`、`bg-cyan-400/18` 等）。JIT 要求编译期可见，**切勿动态拼接类名**。数据智能体映射到「数据」+「分析」两步。

### 10.4 状态管理

| 层 | 技术 | 示例 |
| --- | --- | --- |
| 组件内 | `useState` | 表单、加载、对话框 |
| 跨组件 UI | Zustand `locale-store` + localStorage | 语言、agentLanguage |
| 服务端数据 | TanStack React Query（目标） | 项目、运行、产物 |
| Agent 状态机 | `useAgentRun` | idle→running→needs_review→approved→applied |

### 10.5 i18n

- 引擎 `next-intl`；`messages/{zh-CN,en-US}.json`；默认 `zh-CN`。
- 字符串 `t("key")`；**数组/对象必须用 `t.raw("key")`**，否则抛 `INVALID_MESSAGE`。
- 新增文案**必须同时更新两个 locale 文件**，否则 `MISSING_MESSAGE`。
- 测试中用到 `useTranslations` 的组件需包裹 `NextIntlClientProvider`。

### 10.6 主题

- **单一暗色主题**：`ThemeProvider` 在 hydration 前注入 `data-theme="dark"`，无切换开关。
- `app/globals.css` 的 token 是**空格分隔 HSL 分量**（如 `216 98% 52%`），**不得**用 `hsl()` 包裹或 `#hex`——Tailwind 工具类与 recharts 都依赖此格式。
- 主色 IBM Technology Blue（`--primary: 216 98% 52%`）；宇宙背景类 `.cosmic-bg` / `.cosmic-panel`。

---

## 11. 测试

### 11.1 前端单元 / 组件（Vitest）

- 配置：`vitest.config.ts`（jsdom、globals、`@/` 别名），`vitest.setup.ts` mock `crypto.subtle.digest` 与 `crypto.randomUUID`（jsdom 不提供）。
- 运行：`pnpm vitest run [path]`。
- 注意：`tsconfig.json` 只包含 `app/`、`components/`、`lib/`，测试不在应用类型检查内。

### 11.2 E2E（Playwright）

- 仅 Chromium；**固定端口 3100**、`reuseExistingServer: false`、`workers: 1`（避免 IndexedDB/对话框竞态）——**不要**改并行。
- `e2e/supabase-collaboration.spec.ts` 仅在 `REAL_SUPABASE_E2E=true` 且配置真实凭据时运行（迁移期遗留）。

### 11.3 后端（pytest）

- `services/backend/tests/`（`asyncio_mode=auto`）；`ruff check`（line-length 120）。
- 运行：`pnpm agent:test` 或 `cd services/backend && pytest`。
- `pyrightconfig.json` 覆盖 `services/backend/app`、`tests` 与 `services/eval`。

---

## 12. 构建与部署

- `next.config.mjs`：`output: "standalone"`（web Docker 镜像依赖）、`serverActions.bodySizeLimit` 10MB、客户端 webpack fallback 关闭 `fs`/`path`/`crypto`。
- compose 拓扑：`web · backend · worker · postgres · redis · proxy · eval(profile)`；`migrate` 先行。
- `docker/web.Dockerfile` 多阶段构建，构建期需 `AUTH_SECRET`（Auth.js 静态分析会校验）。
- Caddy（`proxy/Caddyfile`）终止 TLS 并为 SSE 关闭缓冲。
- **不再以 Vercel 为目标**；`vercel.json` 与旧部署文档作为遗留。

详见[部署指南](./deployment.md)。

---

## 13. 迁移策略与已知问题

**策略**（见 `IMPLEMENTATION_PLAN.md`）：

- 特性冻结分支，`AGENT_RUNTIME=langgraph|legacy` 开关灰度切换。
- 前端从 Dexie hooks 逐步切到 React Query shim。
- 旧栈代码在对应 Stage 完成后整体删除，不做无谓的就地改造。

**迁移期不一致（有意保留，勿据此判断架构）**：

- `middleware.ts` 仍只为 `/training/:path*` 刷新 Supabase auth。
- `isCollaborativeMode()` 已弃用且硬编码 `true`；`NEXT_PUBLIC_COLLABORATIVE_MODE` 仅 Playwright 设置。
- `lib/local/*`、`lib/supabase/*`、`lib/mcp/*` 与 `app/api/{agents,mcp,hermes,training}` 属旧栈。
- 大型文件 `components/agents/agent-configs.tsx`、`lib/local/hooks.ts` 随迁移拆分。

---

## 附录

### A. 历史架构（迁移中）

重构前为**浏览器本地优先**：

- **本地库**：Dexie.js（IndexedDB），库名 `ischolar-v6-local`，含科研表、训练表、插件表；写操作 fire-and-forget 镜像到 Supabase。
- **协作层**：Supabase Auth + PostgreSQL + RLS，训练营 / 成员 / 提交 / 审核 / 同意记录；角色 `learner`/`librarian`/`admin` 与营内 `ta`。
- **向量**：浏览器端 Transformers.js（`Xenova/all-MiniLM-L6-v2`，384 维）。
- **Agent**：Next.js `/api/agents/[agent]` 直连 DeepSeek，`runAgentStream` 编排。
- **认证**：本地密码（随机盐 + SHA-256）+ localStorage 会话。

这些实现仍在运行，按 Stage 逐步删除。表结构与迁移清单的历史版本见[数据库结构说明](./database.md)附录。

### B. 智能体输入 / 输出总览

| 智能体 | 输入字段 | 输出结构 |
| --- | --- | --- |
| Topic | discipline, keywords, targetJournal | topics[{title,gap,novelty,value,feasibility,rationale}] |
| LitReview | query, yearFrom, yearTo, maxResults | papers[{title,authors,year,venue,method,findings,doi}], themes[], gaps[] |
| Design | researchQuestion, methodology | feasibility{score,factors}, hypotheses[], variables{…} |
| Data | dataSource, collectionMethod | scripts[{language,filename,code}], recommendations[], analysisPlan[] |
| Write | section, citationStyle | references[{key,authors,title,year,venue,doi}], section, wordCount |
| Submit | abstract, keywords, openAccess | journals[{name,fitScore,impactFactor,reviewTimeline,openAccess,rationale}], checklist[] |
| Rebuttal | reviewerComments, pdfFile | responses[{commentNumber,comment,response,changeLocation,evidence}] |

### C. Key 文件索引

| 文件 | 职责 |
| --- | --- |
| `services/backend/app/main.py` | FastAPI 入口 |
| `services/backend/app/core/security.py` | 服务身份签名与校验 |
| `services/backend/app/core/config.py` | 后端设置 |
| `services/backend/app/models/domain.py` | 领域模型 |
| `services/backend/app/agents/harness.py` | AgentHarness（预算/事件/幂等产物） |
| `services/backend/app/api/v1/agent.py` | Agent API + SSE |
| `services/backend/alembic/versions/` | 领域迁移 |
| `db/init/*.sql` | 扩展 + auth 表 |
| `lib/auth.ts` / `lib/auth/users.ts` | Auth.js 配置 / auth 表访问 |
| `lib/server/backend.ts` | BFF 签名助手 |
| `app/api/agent/[...path]/route.ts` | BFF 薄代理 |
| `app/(app)/layout.tsx` | 条件布局 |
| `components/agents/agent-configs.tsx` | 智能体 UI 配置 |
| `components/module/stages.ts` | 8 阶段 + 强调色 |
| `messages/{zh-CN,en-US}.json` | i18n 文案 |
| `docker-compose.yml` / `proxy/Caddyfile` | 平台拓扑 / 反代 |
