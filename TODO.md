# TODO.md — iScholar v6.0 路线图

> 最近更新：2026-09-20  
> 状态标记：🔴 未开始 | 🟡 进行中 | 🟢 已完成 | ⚪ 可选增强  
> **权威路线图是 [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md)**（记录锁定决策与阶段状态）；本文件面向工程执行，跟踪细化任务与验证记录。

---

## 当前状态

平台正在从「浏览器本地（Dexie/IndexedDB）+ 可选 Supabase」迁移到**全 Docker 平台**（Next.js BFF + Python FastAPI/LangGraph + PostgreSQL/pgvector + Redis + Caddy）。旧栈仍在运行，按阶段逐步删除。

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| Stage 0 · Docker + Postgres + Auth | 🟡 进行中 | compose/dev overlay、`services/backend` 骨架、HMAC 服务身份、Auth.js 配置、`db/init` auth 表、Alembic 脚手架已就位 |
| Stage 1 · 后端数据 API | 🔴 未开始 | 领域表迁移、`/v1/data/*`、训练路由改为代理、删除 `lib/supabase/*` 与 `lib/local/*` |
| Stage 2 · Agent 运行时核心 | 🔴 未开始 | LangGraph 图 + `AgentHarness`、DeepSeek tool-calling、BFF 代理 |
| Stage 3 · MCP 客户端 + 服务端 | 🔴 未开始 | 真实 MCP、SSRF/体量守卫 |
| Stage 4 · 迁移 7 个智能体 | 🔴 未开始 | 每智能体一张图、legacy-vs-new 奇偶校验 |
| Stage 5 · 评估 harness | 🔴 未开始 | 数据集、确定性检查、LLM judge、CI 阈值 |
| Stage 6 · Hermes/训练/插件/清理 | 🔴 未开始 | 训练图、Postgres 插件、删除遗留直连 DeepSeek 路径 |
| 旧栈功能（迁移期仍在线） | 🟢/🟡 | 7 智能体、模块外壳、训练营、插件、质量门禁见下 |

---

## 迁移任务（按 Stage）

### Stage 0 — Docker + Postgres + Auth 🟡

- 🟢 `docker-compose.yml` / `docker-compose.dev.yml` / `docker/web.Dockerfile` / `proxy/Caddyfile`
- 🟢 `services/backend`：FastAPI config、async DB、`/v1/healthz`、`/v1/readyz`、`/v1/me`、`/v1/data/projects`、`/v1/agent/*`、`AgentHarness`、Alembic
- 🟢 服务身份：HMAC-SHA256 `X-IScholar-*` 头 + `AGENT_SERVICE_TOKEN`，后端 ±300s 校验（`app/core/security.py`，web 侧 `lib/server/backend.ts`）
- 🟢 `db/init`：扩展 + auth 表（`users` / `accounts` / `verification_token`）
- 🟢 Auth.js：`lib/auth.ts`（Credentials + Postgres）、`app/api/auth/[...nextauth]/route.ts`
- 🟡 待办：确认容器可起、Auth.js 路由响应、`services/backend/tests/test_health.py` 与 `__tests__/lib/auth.test.ts` 全绿
- 🟡 待办：`middleware.ts` 仍只为 `/training/:path*` 刷新 Supabase auth —— 需随 Supabase 移除一并删除
- 🟡 待办：`web` 构建需 `AUTH_SECRET`（standalone 构建期静态分析会校验）

### Stage 1 — 后端数据 API 🔴

- 🔴 研究/训练/组织/LMS 表的 SQLAlchemy 模型 + Alembic 迁移
- 🔴 `/v1/data/*` 全量领域 CRUD + 授权（按 `owner_id`）
- 🔴 25 个 `app/api/training/**` 路由改为 BFF 代理
- 🔴 同意与审计落 Postgres；实时改用 `LISTEN/NOTIFY` → SSE
- 🔴 插件数据按用户落 Postgres
- 🔴 删除 `lib/supabase/*`、`lib/local/*`，无残留 `@supabase/*` / `dexie` import

### Stage 2 — Agent 运行时核心 🔴

- 🔴 model / tool / planner 节点、state、隐私守卫
- 🔴 Postgres checkpointer（`langgraph-checkpoint-postgres`）
- 🔴 `/v1/agent/runs` + resume + state（部分已在骨架中）
- 🔴 `app/api/agents/[agent]/route.ts` 以 `AGENT_RUNTIME=langgraph|legacy` 开关代理
- 🔴 验证 `deepseek-v4-flash` 的 `bind_tools` / streaming / usage

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
| 单测 / 构建 | 🟢 | `tsc` / `lint` / `vitest` / `build` 通过 |
| Playwright E2E | 🟡 | `training-camp` 绿；`REAL_SUPABASE_E2E` 绿；全量 `pnpm test:e2e` 建议复跑 |
| 后端 pytest / ruff | 🟡 | `services/backend/tests/test_health.py`、`test_agent_contract.py`；CI 接入待补 |

---

## P0 — 重构发布前必须

- 🟡 `docker compose config` 通过；`pnpm docker:up` 全栈可起且健康检查通过
- 🟡 `services/backend`：`ruff check && pytest` 全绿
- 🟡 Web：`pnpm lint && pnpm exec tsc --noEmit && pnpm vitest run && pnpm build`
- 🟡 Alembic 迁移在 `migrate` 服务中按序应用；新增迁移不修改已应用版本
- 🟢 服务身份签名/过期校验有测试覆盖；`AGENT_SERVICE_TOKEN` 不出现在浏览器包
- 🟡 目标环境 `DEEPSEEK_API_KEY` / `AUTH_SECRET` / `AGENT_SERVICE_TOKEN` 已配置且非默认值

## P1 — 迁移中途

- 🔴 Stage 1 数据 API 与训练路由代理；旧训练 API 与 `lib/supabase/*` 同步下线
- 🔴 删除 `middleware.ts` 中的 Supabase 逻辑与 `NEXT_PUBLIC_COLLABORATIVE_MODE` 残留
- 🔴 组件层从 `lib/local/hooks` 迁移到 React Query（必要时用 shim 过渡）
- 🔴 `components/agents/agent-configs.tsx`、`lib/local/hooks.ts` 巨型文件随迁移拆分

## P2 — 产品增强

- ⚪ PWA 离线；本地数据加密；多人实时编辑（CRDT/WebRTC 或 Realtime）
- ⚪ 完整 LTI 1.3（Resource Link 启动 / OIDC、Deep Linking、NRPS 花名册同步）
- ⚪ 邀请落地页、邮件催交 webhook、审核多人指派

---

## 验证记录

- 🟢 2026-09-20：`AGENTS.md` 对齐重构中架构；文档（README/TODO/`doc/*`）重写为目标架构
- 🟡 2026-09-20：Stage 0 骨架落地（compose、backend、Auth.js、Alembic、服务身份）——待容器级验证
- 🟢 2026-07-18（旧栈）：`tsc` / `lint` / `vitest` / `build` 通过；`accept:supabase` + `REAL_SUPABASE_E2E` 通过；`training-camp` E2E 绿

### 建议下一步

1. 跑通 Stage 0 验收：`docker compose config` → `pnpm docker:up` → `ruff check && pytest` → `pnpm build`
2. 为服务身份校验、`/v1/agent/*` 状态机补 pytest 契约测试
3. 启动 Stage 1：把 `projects` 之外的领域表与 `/v1/data/*` 落到 Python
4. 每次新增/修改 Alembic 迁移后同步 `doc/database.md`

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
