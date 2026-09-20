# iScholar v6.0

AI 原生学术科研平台 —— 从研究选题到论文投稿与返修，用 **7 大专业 AI 智能体** 陪伴研究者走完整个学术生命周期，并内置 **AI 科研教练训练 MVP**。

> ⚠️ **架构重构进行中。** 平台正在从「浏览器本地优先（Dexie/IndexedDB）+ 可选 Supabase 协作」迁移到 **全 Docker 平台**：Next.js 薄 BFF + Python FastAPI/LangGraph 后端 + PostgreSQL/pgvector + Redis + Caddy。目标与分阶段状态以 [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) 为准。当前仓库中两套栈并存，`doc/` 下的文档描述的是**目标架构**，历史实现见各文档附录。

---

## 目标架构

```text
浏览器 ── React Query ──► web（Next.js 14 + Auth.js，薄 BFF）
                              │  X-IScholar-User/-Timestamp/-Signature（HMAC-SHA256）
                              ▼
                     backend（Python FastAPI，单一服务）
                       ├ /v1/data     领域 CRUD + 授权
                       ├ /v1/agent    LangGraph 图 + AgentHarness + checkpointer
                       ├ /v1/mcp      MCP 客户端池 + MCP 服务端
                       ├ /v1/audit    SHA-256 审计链
                       └ /v1/vectors  pgvector 检索 + 服务端嵌入
                              │
                              ▼
                     postgres(pgvector) · redis ──► DeepSeek（langchain-openai bind_tools）
compose：web · backend · worker · postgres · redis · proxy(Caddy) · eval(profile)
```

**关键决策**（锁定于 `IMPLEMENTATION_PLAN.md`）：

- **数据层**：纯 PostgreSQL（pgvector），彻底移除 Supabase 与 Dexie/IndexedDB。
- **身份**：Auth.js（NextAuth）+ PostgreSQL `users`；web 只直连 **auth 表**，Python 拥有全部领域表。
- **服务间身份**：web 用 `AGENT_SERVICE_TOKEN` 对用户身份做 HMAC 签名后转发，后端**绝不信任未签名的用户 id**，并拒绝 ±300s 之外的过期签名。
- **Agent 运行时**：Python LangGraph 服务，模型 `deepseek-v4-flash`（回退 `deepseek-chat`）。
- **部署**：全 Docker（不再以 Vercel 为目标），Caddy 负责 TLS 与 SSE。

---

## 特性

- **7 大科研智能体** — TopicScout、LitReview、ResearchDesigner、DataPilot、IMRaDWriter、SubmitMatch、RebuttalShow
- **模块工作流外壳** — 每个智能体页是全屏工作区：固定顶栏 + 8 步进度条 + AI 免责横幅 + 输入/预览/输出卡片 + 可折叠使用说明书
- **持久化 Agent 运行** — LangGraph 图 + `AgentHarness`（工具预算、权限、运行事件、幂等产物写入）；SSE 事件流可断线续传
- **可恢复 / 可审批** — 运行支持 `waiting_for_input` / `waiting_for_review` 状态与 `resume` / `cancel`
- **MCP 工具** — Crossref、Semantic Scholar、OpenAlex 学术检索（目标：真实 MCP 客户端 + 服务端）
- **向量检索** — pgvector + 服务端嵌入（目标；旧实现为浏览器端 Transformers.js）
- **审计追踪** — SHA-256 哈希链审计账本
- **AI 科研教练 MVP** — `/training` 覆盖 7 个智能体的 8 个训练任务，含训练营管理、提交审核、个人报告
- **富文本编辑器** — Tiptap + LaTeX（KaTeX）+ 引用插入 + Markdown 导入导出 + 版本历史
- **国际化** — 双语（简体中文 / English）；**单一暗色宇宙主题**（深空海军蓝 + 青色北斗七星）
- **成本仪表盘** — 各智能体 token 消耗与花费统计
- **插件系统** — 自定义 Agent / 提示词包 / 声明式 MCP 工具（目标：Postgres 按用户存储）

---

## 技术栈（目标）

| 层 | 技术 |
| --- | --- |
| Web 框架 | Next.js 14（App Router）+ TypeScript（strict） |
| Web 认证 | Auth.js（NextAuth v5，Credentials + PostgreSQL） |
| Web 数据获取 | TanStack React Query（经 BFF 代理后端） |
| BFF | `app/api/agent/[...path]` + `lib/server/backend.ts`（HMAC 签名） |
| 后端 | Python 3.12 + FastAPI + SQLAlchemy(asyncpg) + Alembic |
| Agent 运行时 | LangGraph + langgraph-checkpoint-postgres + langchain-openai |
| 数据库 | PostgreSQL 16 + pgvector（Alembic 迁移） |
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
- **pnpm ≥ 8** — `npm install -g pnpm`
- **Docker + Docker Compose**（推荐的全平台运行方式）
- **Python 3.12 + [uv](https://docs.astral.sh/uv/)**（仅在你直接开发后端时需要）
- **DeepSeek API Key** — [platform.deepseek.com](https://platform.deepseek.com/)

### 方式 A：全 Docker（目标平台）

```bash
cp .env.example .env          # 填入 DEEPSEEK_API_KEY、AUTH_SECRET、AGENT_SERVICE_TOKEN
pnpm docker:up                # 构建并启动 web/backend/worker/postgres/redis/proxy
docker compose config         # 修改 compose 前先校验
```

- Web：<http://localhost:3000>（Caddy 代理在 80/443）
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
uv pip install -e ".[dev]"    # 或 uv sync
ruff check && pytest
uvicorn app.main:app --reload
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
# DeepSeek（仅服务端）
DEEPSEEK_API_KEY=sk-your-key
DEEPSEEK_MODEL=deepseek-v4-flash
REDIS_URL=redis://redis:6379/0
```

> `AGENT_SERVICE_TOKEN`、`BACKEND_INTERNAL_URL`、`DEEPSEEK_API_KEY`、`AUTH_SECRET` 均为**服务端专用**，绝不能加 `NEXT_PUBLIC_` 前缀或暴露给浏览器。`.env` 已被 git 忽略，切勿提交。

---

## 命令

pnpm 是唯一的包管理器（仅 `pnpm-lock.yaml`）。CI 工作流仍使用 `npm ci`——本地请用 pnpm，不要新增 `package-lock.json`。

```bash
# Web
pnpm dev / build / start / lint
pnpm vitest run [path]           # 全部单测一次运行；按路径跑单个文件
pnpm test:e2e                    # Playwright，自动在 3100 端口起 dev server
pnpm playwright test e2e/<file>  # 单个 E2E
pnpm exec tsc --noEmit           # 没有 typecheck 脚本；pnpm build 也会做类型检查

# 质量门禁
pnpm quality-gate                # lint -> vitest -> build -> e2e
pnpm quality-gate:full           # 含 Supabase schema/验收（迁移期遗留检查）

# Docker 平台
pnpm docker:up / docker:down     # 完整 compose 栈
pnpm agent:dev                   # 后端热重载 overlay
pnpm agent:test                  # docker compose run --rm backend pytest
pnpm agent:eval                  # eval profile（Stage 5 骨架）
docker compose config            # 修改 compose 前校验

# 后端（services/backend，Python 3.12，ruff line-length 120）
ruff check && pytest
```

---

## 目录结构（目标）

```text
app/                              # Next.js App Router
├── (auth)/login/                 # Auth.js 登录
├── (app)/                        # 认证后主应用（模块页全屏，其余侧栏+顶栏）
│   ├── dashboard/  projects/  settings/  tools/  training/
├── api/
│   ├── auth/[...nextauth]/       # Auth.js 路由处理器
│   └── agent/[...path]/          # ★ 指向 Python 后端的签名薄代理
components/
├── module/                       # 模块工作流外壳（顶栏、8 步进度条、卡片、说明书）
├── agents/                       # AgentPageTemplate + agent-configs + outputs/
├── editor/ citations/ layouts/ providers/ ui/  training/
lib/
├── auth.ts  auth/                # Auth.js 配置 + auth 表访问（仅 web）
├── server/backend.ts             # ★ HMAC 签名 + 后端 URL（BFF 助手）
├── server/request-guards.ts      # 遗留 API 守卫链
├── ai/agents/  ai/prompts/       # 前端提示词/执行编排（迁移中）
├── local/  supabase/             # 遗留数据层（迁移期，逐步删除）
├── mcp/ audit/ plugins/ training/ privacy/ pdf/
services/
├── backend/                      # ★ FastAPI + LangGraph + MCP
│   ├── app/main.py               #   入口
│   ├── app/api/v1/               #   /healthz /readyz /me /data /agent
│   ├── app/core/                 #   config / db / security / authz
│   ├── app/agents/               #   graph / harness / runtime / tools
│   ├── app/models/domain.py      #   SQLAlchemy 领域模型
│   ├── app/worker.py             #   worker 入口
│   └── alembic/versions/         #   ★ 唯一的领域 schema 变更来源
└── eval/                         # 评估 harness（Stage 5 骨架）
db/init/                          # Postgres 初始化：扩展 + auth 表（users/accounts/...）
docker/  proxy/  docker-compose.yml  docker-compose.dev.yml
messages/                         # zh-CN.json / en-US.json
__tests__/  e2e/                  # 前端测试；后端测试在 services/backend/tests
```

---

## 研究工作流（7 大智能体）

完整生命周期：**选题 → 综述 → 设计 → 数据 → 写作 → 投稿 → 返修**。8 步进度条中「数据」与「分析」两步共享 DataPilot 智能体。

| # | 智能体 | 输入 | 输出 / 应用 |
| --- | --- | --- | --- |
| 1 | TopicScout | 学科领域、关键词、目标期刊 | 3 个候选选题（新颖性/价值/可行性评分）→ 写入 `topic` 区块 |
| 2 | LitReview | 检索词、年份范围、数据库多选 | 文献表 + 主题/缺口 → 保存为文献条目 |
| 3 | ResearchDesigner | 研究问题、方法提示、研究类型 | 假设、变量表、可行性评估 |
| 4 | DataPilot | 数据来源、收集方法 | 分析脚本（Python/R）、清洗步骤、分析计划 |
| 5 | IMRaDWriter | 章节、引用格式 | 富文本正文 + 参考文献 → 编辑器可编辑 |
| 6 | SubmitMatch | 摘要、关键词、OA 偏好 | 期刊匹配表 + 投稿清单 → 投稿记录 + ZIP 投稿包 |
| 7 | RebuttalShow | 审稿意见文本 / PDF | 逐条回复表 + 修改位置 → 审稿轮次 + 回复条目 |

> 智能体页共享 `AgentPageTemplate`，行为定义在两处：`components/agents/agent-configs.tsx` 的配置对象，以及 `components/agents/configs/<agent>/` 的按智能体目录。

### 添加一个新智能体

1. `lib/ai/prompts/<name>.ts` 添加提示词，`lib/ai/agents/registry.ts` 注册
2. `lib/ai/parse-agent-output.ts` 添加 Zod schema
3. `app/(app)/projects/[projectId]/<name>/page.tsx` 添加页面
4. `components/agents/agent-configs.tsx` 添加配置，`components/agents/outputs/` 添加输出面板
5. `components/module/stages.ts` 增加阶段映射；`messages/{zh-CN,en-US}.json` 补全文案
6. 后端：在 `services/backend/app/agents/` 增加对应 LangGraph 图（目标）

详见 [开发指南](./doc/development.md)。

---

## AI 科研教练 MVP

进入 `/training` 后，系统在当前项目下创建 8 个训练任务：从兴趣到研究问题、检索式、证据核验、研究设计、数据/版权/隐私判断、学术写作、期刊匹配、审稿回复。

- 学员：保存草稿、填写反思、提交、创建证据卡、查看反馈时间线、`/training/report` 个人报告
- 管理：`/training/manage` 训练营、成员、任务编排、报表、导出、结业证
- 审核：`/training/review` 队列、证据卡、反馈模板、认领
- 角色：全局 `learner` / `librarian` / `admin`，营内 `learner` / `ta`

> 目标实现中，训练数据同样由 Python 后端 + PostgreSQL 承载；当前处于迁移期。

---

## 数据与网络边界

- 目标平台中，科研与训练数据存储在 **PostgreSQL**（由 Python 后端持有），不再写入浏览器 IndexedDB。
- DeepSeek 流式生成，以及 Crossref、OpenAlex、Semantic Scholar 等外部服务仍会产生网络请求。Agent 与 MCP 外部调用需要近期同意证明并记录 `consent_id`。
- 不要将「数据在自有服务器」理解为「文本绝不离开设备」；敏感材料应在调用外部服务前脱敏。

---

## 部署

全 Docker 部署，见 [部署指南](./doc/deployment.md)。

```bash
pnpm docker:up
```

- `proxy`（Caddy）在 80/443 终止 TLS，并将 SSE 关闭缓冲转发到 `web`
- `migrate` 服务在 backend/worker 启动前自动迁移
- `worker` 消费后台任务；`eval` 以 `--profile eval` 启用

> 旧的 Vercel 部署方式已不再是目标架构，相关配置作为遗留保留。

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

## 附录：历史架构（迁移中）

重构前，iScholar 采用**浏览器本地优先**架构：科研与训练数据经 Dexie.js 存入浏览器 IndexedDB（库名 `ischolar-v6-local`），并可选同步到 Supabase（Auth + Postgres + RLS）；向量嵌入由浏览器端 Transformers.js（`Xenova/all-MiniLM-L6-v2`）生成。该实现仍存在于 `lib/local/*`、`lib/supabase/*` 及部分 API 路由中，正按 `IMPLEMENTATION_PLAN.md` 的阶段逐步删除。

---

## License

Private project.
# iScholar6
