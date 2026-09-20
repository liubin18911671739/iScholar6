# 开发指南

> 面向开发者的环境搭建、服务边界、扩展与调试指南（**目标架构**）。
>
> ⚠️ 重构进行中，旧栈（Dexie/Supabase）仍在部分代码中运行。权威阶段见 [`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md)。
>
> 相关文档：[系统架构](./architecture.md) · [数据库结构](./database.md) · [部署指南](./deployment.md) · [插件系统](./plugins.md)

---

## 一、环境要求

| 工具 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | **≥ 22** | Node 20 在模块页 SSR 会抛 `Promise.withResolvers is not a function`（pdfjs-dist 依赖在 Node 22 才内置该 API） |
| pnpm | ≥ 8 | `npm install -g pnpm`；仅 `pnpm-lock.yaml`，不要新增 `package-lock.json` |
| Docker + Compose | 最新 | 推荐的全平台运行方式 |
| Python | **3.12** | 直接开发后端时需要（`requires-python >= 3.12`） |
| uv | 最新 | 后端依赖安装：`uv pip install -e ".[dev]"` |
| DeepSeek API Key | — | [platform.deepseek.com](https://platform.deepseek.com/) |

---

## 二、启动

### 方式 A：全 Docker

```bash
cp .env.example .env          # 填 DEEPSEEK_API_KEY / AUTH_SECRET / AGENT_SERVICE_TOKEN
pnpm docker:up                # web + backend + worker + postgres + redis + proxy
pnpm docker:down
```

`migrate` 服务会在 backend/worker 启动前自动执行 `alembic upgrade head`。修改 compose 后用 `docker compose config` 校验。

### 方式 B：本地混合开发（后端热重载）

```bash
pnpm install
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis
pnpm agent:dev                # 后端容器（uvicorn --reload，挂载 services/backend）
pnpm dev                      # 宿主机 web，指向后端容器
```

`docker-compose.dev.yml` 用 `backend.target: dev` 并挂载源码；web 容器在 dev 下被 `container-web` profile 禁用。

### 方式 C：后端直跑（不用容器）

```bash
cd services/backend
uv pip install -e ".[dev]"
uvicorn app.main:app --reload
# 需要数据库时，用 compose 只起 postgres/redis，并把 DATABASE_URL 指向 localhost
```

### 环境变量

目标变量见 [`.env.example`](../.env.example)。开发常用：

```env
DATABASE_URL=postgresql+asyncpg://ischolar:ischolar@localhost:5432/ischolar
AUTH_DATABASE_URL=postgresql://ischolar:ischolar@localhost:5432/ischolar
REDIS_URL=redis://localhost:6379/0
AUTH_SECRET=dev-insecure-change-me
AGENT_SERVICE_TOKEN=dev-insecure-change-me
BACKEND_INTERNAL_URL=http://localhost:8000
DEEPSEEK_API_KEY=sk-your-key
DEEPSEEK_MODEL=deepseek-v4-flash
```

> **服务端专用**（切勿加 `NEXT_PUBLIC_`，切勿提交 `.env`）：`AUTH_SECRET`、`AGENT_SERVICE_TOKEN`、`BACKEND_INTERNAL_URL`、`DEEPSEEK_API_KEY`、`DATABASE_URL`、`AUTH_DATABASE_URL`。

### pnpm 构建脚本提示

首次 `pnpm install` 可能提示 `Ignored build scripts`；`pnpm-workspace.yaml` 已禁用 `sharp`、`onnxruntime-node`、`@swc/core` 等原生构建，属预期，不影响运行。CI 需 `CI=true` 避免交互提示。

---

## 三、常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | Web 开发服务器（localhost:3000，热重载） |
| `pnpm build` | 生产构建（含 TS 类型检查；同时产出 standalone） |
| `pnpm start` | 生产服务器（先 `pnpm build`） |
| `pnpm lint` | ESLint（`next lint`） |
| `pnpm vitest run [path]` | 全部单测一次运行；按路径跑单个文件 |
| `pnpm test` | Vitest watch 模式 |
| `pnpm test:e2e` | Playwright（自动在 3100 端口起 dev server） |
| `pnpm playwright test e2e/<file>` | 单个 E2E |
| `pnpm exec tsc --noEmit` | 类型检查（无 typecheck 脚本） |
| `pnpm quality-gate` | lint → vitest → build → e2e |
| `pnpm quality-gate:full` | 含 Supabase schema/验收（迁移期遗留） |
| `pnpm docker:up` / `pnpm docker:down` | 全 compose 栈 |
| `pnpm agent:dev` | 后端热重载 overlay |
| `pnpm agent:test` | `docker compose run --rm backend pytest` |
| `pnpm agent:eval` | eval profile（Stage 5 骨架） |

后端（`services/backend`，ruff line-length 120）：

```bash
ruff check && pytest
```

> CI（`.github/workflows/ci.yml`）仍用 `npm ci`；本地请统一用 pnpm。

---

## 四、服务边界（最重要）

三条规定，违反会导致安全或数据问题：

1. **领域数据只经 Python 后端**：web 不得直接读写领域表；一律走 `/v1/*`（经 `app/api/agent/[...path]` 代理）。
2. **auth 表只归 web**：`users` / `accounts` / `verification_token` 由 Auth.js 连接池访问；后端**不得**写这些表。
3. **身份必须签名**：web 用 `lib/server/backend.ts` 生成 `X-IScholar-*`；后端用 `app/core/security.py` 校验。**绝不**转发裸用户 id，**绝不**把 `AGENT_SERVICE_TOKEN` / `BACKEND_INTERNAL_URL` 暴露给浏览器。

```ts
// web：BFF 转发
const identity = await backendIdentityHeaders();     // lib/server/backend.ts
if (!identity) return Response.json({ ok:false, error:"UNAUTHENTICATED" }, { status: 401 });
const url = backendUrl(`/v1/${params.path.join("/")}`);
const res = await fetch(url, { method, headers: new Headers(identity), body });
```

---

## 五、目录结构

```text
app/                              # Next.js App Router
├── (auth)/login/                 # Auth.js 登录
├── (app)/                        # 认证后主应用（模块页全屏，其余侧栏+顶栏）
├── api/
│   ├── auth/[...nextauth]/       # Auth.js handlers
│   ├── agent/[...path]/          # ★ 签名薄代理 → 后端 /v1
│   └── …                         # 遗留：agents / mcp / hermes / training
components/
├── module/                       # 模块外壳：顶栏、8 步进度条、AI 横幅、卡片、说明书
├── agents/                       # AgentPageTemplate + agent-configs + configs/ + outputs/
├── editor/ citations/ layouts/ providers/ ui/ training/ plugins/
lib/
├── auth.ts  auth/                # Auth.js 配置 + auth 表访问（仅 web）
├── server/backend.ts            # HMAC 签名 + 后端 URL
├── server/request-guards.ts     # 遗留 API 守卫链
├── ai/agents/ ai/prompts/        # 前端提示词与执行编排（迁移中）
├── local/ supabase/             # 遗留数据层（迁移期）
├── mcp/ audit/ plugins/ training/ privacy/ pdf/
services/
├── backend/app/                 # FastAPI + LangGraph
│   ├── main.py  worker.py
│   ├── api/v1/{health,me,data,agent}.py
│   ├── core/{config,db,security,authz}.py
│   ├── agents/{graph,harness,runtime,tools}.py
│   └── models/domain.py
│   └── alembic/versions/
└── eval/
db/init/  docker/  proxy/  messages/  __tests__/  e2e/
```

---

## 六、后端开发约定

- **入口**：`app/main.py`，所有路由挂 `/v1`。
- **配置**：`app/core/config.py` 的 `Settings`（pydantic-settings，读 `.env`）；用 `get_settings()` 单例。
- **数据库**：SQLAlchemy async（`app/core/db.py` 的 `engine` / `get_session`）；模型放 `app/models/domain.py`。
- **迁移**：**只**通过 Alembic。新增 revision，**不要**修改已应用的版本；compose 的 `migrate` 服务会执行。
- **身份**：路由用 `identity: Identity = Depends(require_identity)`；授权按 `identity.user_id` 过滤。
- **Agent 副作用**：图节点只调用 `AgentHarness`（`emit` / `call_tool` / `save_draft` / `persist_evidence`），不直接写领域表。
- **风格**：ruff `E,F,I,UP,B`（忽略 E501），line-length 120；pytest `asyncio_mode=auto`。
- **测试**：`services/backend/tests/`；`pnpm agent:test` 或 `cd services/backend && pytest`。

---

## 七、添加一个新智能体

### 前端

1. **提示词**：`lib/ai/prompts/<name>.ts`。
2. **注册**：`lib/ai/agents/registry.ts`（`AGENT_IDS`、`AGENT_META`）。
3. **Schema**：`lib/ai/parse-agent-output.ts` 加 Zod schema。
4. **路由**：`app/(app)/projects/[projectId]/<name>/page.tsx`（封装 `AgentPageTemplate`）。
5. **配置**：`components/agents/agent-configs.tsx` 定义 `AgentPageConfig`：
   - `InputsComponent`、`ResultsComponent?`、`OutputComponent`、`buildRunInput`
   - `manuscriptSection` / `manuscriptOrder` / `onApplyExtra` / `customOnApply`
   - `ModuleContentComponent?`（自定义 3 列布局）
6. **输出面板**：`components/agents/outputs/<name>-output.tsx`。
7. **阶段**：`components/module/stages.ts` 增加节点 + `primaryStageForAgent` 映射（强调色用完整静态类）。
8. **i18n**：`messages/{zh-CN,en-US}.json` 的 `module` / `moduleInputs` / `output` 命名空间补全。

### 后端（目标）

9. `services/backend/app/agents/graphs/<name>.py` 定义 LangGraph 图，经 `AgentHarness` 产生事件与产物。
10. 在 `runtime.py` 注册图；`agent` 字段的 `pattern`（`agent.py` 的 `RunCreate`）加入新 id。
11. 补 `services/backend/tests/` 契约测试。

---

## 八、国际化（i18n）

- 引擎 `next-intl`；`messages/{zh-CN,en-US}.json`；默认 `zh-CN`（`lib/i18n/config.ts`）。
- 切换：顶栏 Language 选择器 → `useLocaleStore`。
- 取值：
  - 字符串：`const t = useTranslations("namespace"); t("key")`
  - **数组/对象**：`t.raw("key")`（用于 `UserManual` 步骤等）
  - **⚠️ 数组键不可用 `t()`**，否则抛 `INVALID_MESSAGE`；把数组放在 `*List` 键，标签单独放 `*Label` 键
- **新增文案必须同时更新两个 locale**，否则 `MISSING_MESSAGE`。
- `moduleInputs` 命名空间存放各模块专属 UI 文案（标签、占位符、状态文本、选项数组）。

---

## 九、主题系统

- **单一暗色主题**：`[data-theme="dark"]`（`ThemeProvider` 在 hydration 前注入），无切换开关。
- Token 格式：`app/globals.css` 中为**空格分隔 HSL 分量**（无 `hsl()` 包裹）——Tailwind 工具类与 recharts 内联 `hsl(var(--token))` 都依赖此格式。**勿改成 hex 或 `hsl(...)` 全包**。
- 宇宙背景：`.cosmic-bg`（多层径向辉光 + 星点）、`.cosmic-panel`（玻璃卡片）、`.glow-cyan` / `.glow-violet`。

---

## 十、测试

### 单元 / 组件（Vitest）

- 配置：`vitest.config.ts`（jsdom、globals、`@/` 别名），`vitest.setup.ts` mock Web Crypto（`crypto.subtle.digest`、`crypto.randomUUID`）——jsdom 不提供，故哈希/UUID 在单测中是**确定性**的。
- 运行：`pnpm vitest run`（一次）或 `pnpm test`（watch）。

**i18n 上下文修复**——使用 `useTranslations()` 的组件测试需包裹：

```tsx
import { NextIntlClientProvider } from "next-intl";
const mockMessages = { myNamespace: { myKey: "文本" } };
render(React.createElement(NextIntlClientProvider, { locale: "zh-CN", messages: mockMessages }, ui));
```

**recharts 无限重渲染**：把传入图表的数组用 `useMemo` 包裹（依赖原始数据），并把所有 hooks 移到 early return 之前。

### E2E（Playwright）

- 仅 Chromium；**端口 3100**、`reuseExistingServer: false`、`workers: 1`。这是为规避 IndexedDB/对话框竞态**有意为之**，不要改成并行。
- 运行：`pnpm test:e2e`（自动起 dev server）或 `pnpm playwright test e2e/<file>`。

### 后端（pytest）

```bash
cd services/backend && ruff check && pytest
# 或
pnpm agent:test
```

---

## 十一、常见问题

**Q：`INVALID_MESSAGE`？**
A：用 `t()` 访问了数组值。改用 `t.raw("key")`，或将数组键改名为独立键。

**Q：测试中 `useTranslations` 报错？**
A：缺少 `NextIntlClientProvider`（见第十节）。

**Q：recharts 无限重渲染？**
A：`useMemo` 包裹图表数组，并把 hooks 移到 early return 之前。

**Q：Node 20 下模块页 SSR 报 `Promise.withResolvers`？**
A：升级到 Node 22+。

**Q：`.next` 缓存导致模块找不到？**
A：切换 Node 版本后 `rm -rf .next && pnpm build`。

**Q：`pnpm install` 提示 `Ignored build scripts`？**
A：预期行为（`pnpm-workspace.yaml` 主动禁用），无需处理。

**Q：改了领域表却没生效？**
A：新增 Alembic revision，重跑 `migrate`（`alembic upgrade head`）。
