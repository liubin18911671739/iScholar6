# iScholar v6.0

AI 原生学术科研平台 —— 从研究选题到论文投稿与返修，用 **7 大专业 AI 智能体** 陪伴研究者走完整个学术生命周期，并内置 **AI 科研教练训练 MVP**。

> 平台为**全 Docker、后端单一数据源**架构：Next.js 14 薄 BFF（Auth.js + 签名代理）+ Python FastAPI/LangGraph 后端 + PostgreSQL/pgvector + Redis + Caddy。
> 旧栈（Dexie/IndexedDB + Supabase + 浏览器直连 DeepSeek）已**完全移除**：`lib/local/*`、`lib/supabase/*`、`lib/lms/*`、`@supabase/*`、`dexie` 均已删除，客户端只经签名 BFF 访问后端。
> 工程执行状态见 [`TODO.md`](./TODO.md)，锁定决策见 [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md)；AI 助理指引见 [`AGENTS.md`](./AGENTS.md)。

---

## 架构

```text
浏览器 ── React Query ──► web（Next.js 14 + Auth.js，薄 BFF）
                              │  X-IScholar-User/-Timestamp/-Signature（HMAC-SHA256）
                              ▼
                     backend（Python FastAPI，单一服务）
                       ├ /v1/data      领域 CRUD + 授权
                       ├ /v1/agent     LangGraph 图 + AgentHarness + checkpointer
                       ├ /v1/training  训练营 / 组织 / LMS / 报表 / 证书
                       ├ /v1/mcp       MCP 客户端池 + 服务端
                       ├ /v1/audit     SHA-256 审计链 + 同意
                       ├ /v1/realtime  LISTEN/NOTIFY → SSE
                       └ /v1/vectors   pgvector 检索 + 服务端嵌入
                              │
                              ▼
                     postgres(pgvector) · redis ──► DeepSeek（langchain-openai，bind_tools + 流式）
compose：web · backend · worker · postgres · redis · proxy(Caddy) · eval(profile) · vectors(profile)
```

**关键决策**：

- **数据层**：纯 PostgreSQL（pgvector），彻底移除 Supabase 与 Dexie/IndexedDB。
- **身份**：Auth.js（NextAuth）+ PostgreSQL `users`；web 只直连 **auth 表**，Python 拥有全部领域表。
- **服务间身份**：web 用 `AGENT_SERVICE_TOKEN` 对用户身份做 HMAC 签名后转发，后端**绝不信任未签名的用户 id**，并拒绝 ±300s 之外的过期签名。
- **Agent 运行时**：Python LangGraph 服务，模型 `deepseek-v4-flash`（回退 `deepseek-chat`），支持 `bind_tools` 工具调用与 SSE 流式输出。
- **部署**：全 Docker（不再以 Vercel 为目标），Caddy 负责 TLS 与 SSE。

---

## 实现状态

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| Stage 0 · Docker + Auth | 🟢 | compose（web/backend/worker/postgres/redis/proxy）；Auth.js（Credentials + Postgres）+ Edge `middleware.ts` 守卫；HMAC 服务身份；Alembic + `db/init` auth 表 |
| Stage 1 · 后端数据 API | 🟢 | `/v1/data/*`（12 资源）+ `/v1/vectors`；`/v1/training/*` 全套（analytics/export/LMS gradebook/consents/evidence）；`/v1/audit`、`/v1/realtime`、`/v1/plugins`；前端数据层 `lib/client/*` + React Query（`@/lib/hooks`） |
| Stage 2 · Agent 运行时核心 | 🟡 | durable run API（threads/runs/SSE/resume/cancel）+ `AgentHarness` + LangGraph + Postgres checkpointer + worker；DeepSeek `bind_tools` 与 SSE 流式已接入；剩余：状态机契约测试 |
| Stage 3 · MCP | 🟢 | 工具注册表 + SSRF/2 MiB 守卫 + FastMCP 服务端 + 客户端池 + `/v1/mcp` REST |
| Stage 4 · 7 个智能体 | 🟢 | 7 张图 + prompts + Pydantic 结构化输出；Agent UI 走后端 `/api/agent` |
| Stage 5 · 评估 harness | 🟢 | 离线数据集/检查/阈值报告 + `EVAL_MODE=live` + 可选 LLM judge（仓库无 CI） |
| Stage 6 · Hermes/训练/插件/清理 | 🟡 | Hermes 图、插件按用户 Postgres、遗留直连路由已删除；defer：可检查点训练图、声明式插件工具 |
| 质量门禁 | 🟢 | `tsc` / `lint` / `vitest`（44 文件 202 用例）/ `build` / 后端 `ruff` + `pytest`（136）/ 评估 `pytest` 全绿 |

---

## 特性

- **7 大科研智能体** — TopicScout、LitReview、ResearchDesigner、DataPilot、IMRaDWriter、SubmitMatch、RebuttalShow
- **模块工作流外壳** — 每个智能体页是全屏工作区：固定顶栏 + 8 步进度条 + AI 免责横幅 + 输入/预览/输出卡片 + 可折叠使用说明书
- **持久化 Agent 运行** — LangGraph 图 + `AgentHarness`（工具预算、权限、运行事件、幂等产物写入）；SSE 事件流可断线续传
- **可恢复 / 可审批** — 运行支持 `waiting_for_input` / `waiting_for_review` 状态与 `resume` / `cancel`
- **模型工具调用 + 流式** — DeepSeek `bind_tools`（模型驱动工具调用）+ `message.delta` 增量输出
- **MCP 工具** — Crossref、Semantic Scholar、OpenAlex 学术检索 + `ischolar.*` 领域工具
- **向量检索** — pgvector + 服务端嵌入（`/v1/vectors`，可选 `sentence-transformers`）
- **审计追踪** — SHA-256 哈希链审计账本；服务端 PII 门（训练提交/证据卡）
- **AI 科研教练 MVP** — `/training` 覆盖 7 个智能体的 8 个训练任务，含训练营管理、提交审核、个人报告、LMS 成绩回传
- **富文本编辑器** — Tiptap + LaTeX（KaTeX）+ 引用插入 + Markdown 导入导出 + 版本历史
- **国际化** — 双语（简体中文 / English）；**单一暗色宇宙主题**（深空海军蓝 + 青色北斗七星）
- **成本仪表盘** — 各智能体 token 消耗与花费统计
- **插件系统** — 自定义 Agent / 提示词包，按用户持久化于 Postgres

---

## 技术栈

| 层 | 技术 |
| --- | --- |
| Web 框架 | Next.js 14（App Router）+ TypeScript（strict） |
| Web 认证 | Auth.js（NextAuth v5，Credentials + PostgreSQL） |
| Web 数据获取 | TanStack React Query（经 BFF 代理后端） |
| BFF | `app/api/{agent,data,training,audit,realtime,vectors,plugins}/[...path]` + `app/api/mcp/[tool]`（`lib/server/backend-proxy.ts`，HMAC 签名 + allowlist） |
| 后端 | Python 3.12 + FastAPI + SQLAlchemy(asyncpg) + Alembic |
| Agent 运行时 | LangGraph + langgraph-checkpoint-postgres + langchain-openai |
| 数据库 | PostgreSQL 16 + pgvector（Alembic 迁移，12 个，head `20260929_0012`） |
| 缓存 / 限流 | Redis 7 |
| AI 模型 | DeepSeek `deepseek-v4-flash`（回退 `deepseek-chat`） |
| 反向代理 | Caddy 2（TLS + SSE 反缓冲） |
| UI | Tailwind CSS + shadcn/ui（Radix primitives） |
| 状态 | Zustand（locale）+ React Query |
| 国际化 / 主题 | next-intl（zh-CN 默认）/ 单一暗色主题 |
| 编辑器 | Tiptap + KaTeX + Markdown 转换 |
| 测试 | Vitest（前端）+ Playwright（E2E）+ pytest（后端） |

---

## 快速开始

### 前置条件

- **Node.js ≥ 22**（**Node 20 会因 `Promise.withResolvers` 缺失导致动态路由 SSR 崩溃**）
- **pnpm 10** — `corepack enable`（`packageManager` 已固定 `pnpm@10.31.0`）
- **Docker + Docker Compose**（推荐的全平台运行方式）
- **Python 3.12 + [uv](https://docs.astral.sh/uv/)**（仅在你直接开发后端时需要）
- **DeepSeek API Key** — [platform.deepseek.com](https://platform.deepseek.com/)

### 方式 A：全 Docker

```bash
cp .env.example .env          # 填入 POSTGRES_PASSWORD、AUTH_SECRET、AGENT_SERVICE_TOKEN、DEEPSEEK_API_KEY
pnpm docker:up                # 构建并启动 web/backend/worker/postgres/redis/proxy
docker compose config         # 修改 compose 前先校验
```

- Web：[http://localhost:3000](http://localhost:3000)（Caddy 代理在 80/443）
- 后端健康检查：`GET /v1/healthz`、`GET /v1/readyz`
- `migrate` 服务会在 backend/worker 启动前自动执行 `alembic upgrade head`

停止：`pnpm docker:down`。

### 方式 B：本地混合开发

```bash
pnpm install
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis
pnpm agent:dev                # 后端容器热重载（uvicorn --reload）
pnpm dev                      # 宿主机运行 web，指向后端容器
```

后端直跑（不用容器）：

```bash
cd services/backend
uv sync --extra dev           # 仓库内 .venv 默认不含 pytest/ruff，需带 --extra dev
uv run ruff check && uv run pytest
uv run uvicorn app.main:app --reload
```

### 环境变量

完整列表见 [`.env.example`](./.env.example)。关键项：

```env
# 后端（asyncpg）与 Alembic
DATABASE_URL=postgresql+asyncpg://ischolar:ischolar@postgres:5432/ischolar
# web / Auth.js 适配器（仅 auth 表）
AUTH_DATABASE_URL=postgresql://ischolar:ischolar@postgres:5432/ischolar
AUTH_SECRET=dev-insecure-change-me          # openssl rand -base64 32
AUTH_URL=http://localhost:3000
# 服务间身份签名（web ↔ backend）
AGENT_SERVICE_TOKEN=dev-insecure-change-me
BACKEND_INTERNAL_URL=http://backend:8000
# 附件 / 脚本的文件系统 blob 卷
STORAGE_DIR=/data/storage
# DeepSeek（仅服务端）
DEEPSEEK_API_KEY=sk-your-key
DEEPSEEK_MODEL=deepseek-v4-flash
REDIS_URL=redis://redis:6379/0
```

> `AGENT_SERVICE_TOKEN`、`BACKEND_INTERNAL_URL`、`DEEPSEEK_API_KEY`、`AUTH_SECRET` 均为**服务端专用**，绝不能加 `NEXT_PUBLIC_` 前缀或暴露给浏览器。`.env` 已被 git 忽略，切勿提交。

---

## 命令

pnpm 是唯一的包管理器（仅 `pnpm-lock.yaml`），不要新增 `package-lock.json`。仓库**没有 CI 工作流**（无 `.github/`），发布前请在本地运行 `pnpm quality-gate`。

```bash
# Web
pnpm dev / build / start / lint
pnpm vitest run [path]           # 全部单测一次运行；按路径跑单个文件
pnpm test:e2e                    # Playwright，自动在 3100 端口起 dev server
pnpm playwright test e2e/<file>  # 单个 E2E
pnpm exec tsc --noEmit           # 没有 typecheck 脚本；pnpm build 也会做类型检查

# 质量门禁
pnpm quality-gate                # lint -> vitest -> build -> e2e（本地全绿）

# Docker 平台
pnpm docker:up / docker:down     # 完整 compose 栈
pnpm agent:dev                   # 后端热重载 overlay
pnpm agent:test                  # docker compose run --rm backend pytest（后端可达 Postgres）
pnpm agent:eval                  # eval profile（离线数据集 + 确定性检查 + 阈值报告）
docker compose config            # 修改 compose 前校验

# 后端（services/backend，Python 3.12，ruff line-length 120）
uv sync --extra dev && uv run ruff check && uv run pytest
```

---

## 目录结构（关键路径）

```text
app/                              # Next.js App Router
├── (auth)/login/                 # Auth.js 登录
├── (app)/                        # 认证后主应用（模块页全屏，其余侧栏+顶栏）
│   ├── dashboard/  projects/  settings/  tools/  training/
├── api/
│   ├── auth/[...nextauth]/       # Auth.js 路由处理器
│   ├── agent/ data/ training/ audit/ realtime/ vectors/ plugins/  # ★ 指向 Python 后端的签名薄代理
│   ├── mcp/[tool]/               # ★ MCP 适配器（重塑 flat body → 后端契约）
│   └── invites/                  # web 自有：训练邀请（邮件 + 签名接受链接）
components/
├── module/                       # 模块工作流外壳（顶栏、8 步进度条、卡片、说明书）
├── agents/                       # AgentPageTemplate + configs/<agent>/ + outputs/
├── editor/ citations/ layouts/ providers/ ui/  training/
lib/
├── auth.ts  auth.config.ts       # Auth.js 配置（auth.ts 含 pg；auth.config.ts 为 Edge-safe）
├── hooks.ts                      # @/lib/hooks → lib/client/hooks 的纯 re-export
├── server/backend.ts             # ★ HMAC 签名 + 后端 URL（BFF 助手）
├── server/backend-proxy.ts       # ★ 共享签名代理（allowlist + 路径穿越守卫）
├── client/                       # ★ 前端数据层（http + 各领域客户端 + React Query hooks）
├── ai/agents/  ai/prompts/       # 前端提示词/执行编排（走后端 /api/agent）
├── mcp/ plugins/ audit/ training/ privacy/ pdf/
services/
├── backend/                      # ★ FastAPI + LangGraph + MCP
│   ├── app/main.py               #   入口
│   ├── app/api/v1/               #   /healthz /readyz /me /data /vectors /agent /training /mcp /audit /realtime /plugins
│   ├── app/core/                 #   config / db / security / authz / events
│   ├── app/agents/               #   harness / runtime / model / prompts / schemas / graphs/*
│   ├── app/models/               #   domain.py / research.py / training.py / plugins.py
│   ├── app/storage/              #   文件系统 blob（sha-256、25 MiB 上限）
│   ├── app/vectors/              #   服务端嵌入（可选依赖）+ backfill worker
│   ├── app/worker.py             #   agent run worker 入口
│   └── alembic/versions/         #   ★ 唯一的领域 schema 变更来源（12 个迁移）
└── eval/                         # 评估 harness（离线数据集 + 检查 + 阈值报告）
db/init/                          # Postgres 初始化：扩展 + auth 表（users/accounts/...）
docker/  proxy/  docker-compose.yml  docker-compose.dev.yml
messages/                         # zh-CN.json / en-US.json
__tests__/  e2e/                  # 前端测试；后端测试在 services/backend/tests
```

---

## 研究工作流（7 大智能体）

完整生命周期：**选题 → 综述 → 设计 → 数据 → 写作 → 投稿 → 返修**。8 步进度条中「数据」与「分析」两步共享 DataPilot 智能体。

| # | 智能体 | 输入 | 输出 / 应用 |
| - | --- | --- | --- |
| 1 | TopicScout | 学科领域、关键词、目标期刊 | 3 个候选选题（新颖性/价值/可行性评分）→ 写入 `topic` 区块 |
| 2 | LitReview | 检索词、年份范围、数据库多选 | 文献表 + 主题/缺口 → 保存为文献条目 |
| 3 | ResearchDesigner | 研究问题、方法提示、研究类型 | 假设、变量表、可行性评估 |
| 4 | DataPilot | 数据来源、收集方法 | 分析脚本（Python/R）、清洗步骤、分析计划 |
| 5 | IMRaDWriter | 章节、引用格式 | 富文本正文 + 参考文献 → 编辑器可编辑 |
| 6 | SubmitMatch | 摘要、关键词、OA 偏好 | 期刊匹配表 + 投稿清单 → 投稿记录 + ZIP 投稿包 |
| 7 | RebuttalShow | 审稿意见文本 / PDF | 逐条回复表 + 修改位置 → 审稿轮次 + 回复条目 |

> 智能体页共享 `AgentPageTemplate`，行为定义在 `components/agents/configs/<agent>/` 的按智能体目录，注册表在 `components/agents/`。

### 添加一个新智能体

1. 前端：在 `components/agents/configs/<agent>/` 增加配置 + 输入 + 模块内容，并在 `components/agents/` 注册；`components/module/stages.ts` 增加阶段映射；补 `messages/{zh-CN,en-US}.json`
2. 后端：在 `services/backend/app/agents/graphs/` 增加 LangGraph 图（`prompts.py`/`schemas.py` 补提示词与结构化输出），并在 `app/agents/graphs/__init__.py` 注册
3. `lib/ai/agents/registry.ts` 注册智能体元数据

详见 [开发指南](./doc/development.md)。

---

## AI 科研教练 MVP

进入 `/training` 后，系统在当前项目下创建 8 个训练任务：从兴趣到研究问题、检索式、证据核验、研究设计、数据/版权/隐私判断、学术写作、期刊匹配、审稿回复。

- 学员：保存草稿、填写反思、提交、创建证据卡、查看反馈时间线、`/training/report` 个人报告
- 管理：`/training/manage` 训练营、成员、任务编排、报表、导出、结业证
- 审核：`/training/review` 队列、证据卡、反馈模板、认领
- 角色：全局 `learner` / `librarian` / `admin`，营内 `learner` / `ta`
- 数据由 Python 后端 + PostgreSQL 承载；提交与证据卡经服务端 PII 门（`400 SENSITIVE_CONTENT`）

---

## 数据与网络边界

- 科研与训练数据存储在 **PostgreSQL**（由 Python 后端持有），不写入浏览器 IndexedDB。
- DeepSeek 生成（含流式），以及 Crossref、OpenAlex、Semantic Scholar 等外部服务仍会产生网络请求。Agent 与 MCP 外部调用需要近期同意证明并记录 `consent_id`。
- 不要将「数据在自有服务器」理解为「文本绝不离开设备」；敏感材料应在调用外部服务前脱敏（服务端 PII 门会拒绝明显敏感内容）。

---

## 部署

全 Docker 部署，见 [部署指南](./doc/deployment.md)。

```bash
pnpm docker:up
```

- `proxy`（Caddy）在 80/443 终止 TLS，并将 SSE 关闭缓冲转发到 `web`
- `migrate` 服务在 backend/worker 启动前自动迁移（当前 12 个 Alembic 迁移，head `20260929_0012`）
- `worker` 消费后台任务（`SKIP LOCKED` 租约）；`eval` 以 `--profile eval` 启用，服务端嵌入以 `--profile vectors` 启用
- `storage` 卷挂载到 backend/worker 的 `STORAGE_DIR`，承载附件与脚本 blob

---

## 文档

详细指南位于 [`doc/`](./doc)：

- 📖 **[使用指南](./doc/usage.md)** — 登录、模块工作流、7 大智能体、引用管理、训练营、数据管理
- 🛠️ **[开发指南](./doc/development.md)** — 环境、命令、服务边界、添加智能体、i18n 与主题
- 🏗️ **[系统架构](./doc/architecture.md)** — web/backend 分层、服务身份、LangGraph、数据流
- 🗄️ **[数据库结构](./doc/database.md)** — Postgres/Alembic、auth 表、领域模型、pgvector
- 🚀 **[部署指南](./doc/deployment.md)** — Docker Compose、Caddy/HTTPS、环境变量、迁移
- ✨ **[使用示例](./doc/examples.md)** — 7 大智能体的输入/输出示例
- 🧩 **[插件系统](./doc/plugins.md)** / 📚 **[LMS 对接](./doc/lms.md)** / 📦 **[训练任务包](./doc/training-packs.md)**

路线图与阶段状态见 [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) 与 [`TODO.md`](./TODO.md)。

---

## License

Private project.
