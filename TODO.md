# TODO.md — iScholar v6.0 路线图

> 最近更新：2026-09-30
> 状态：🔴 未开始 | 🟡 进行中 | 🟢 已完成 | ⚪ 可选 / 本轮 defer
> 方向以 [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) 为准；本文件跟踪执行进度与验证。
> `CLAUDE.md` 已过时（描述旧浏览器本地栈）；`AGENTS.md` 是维护中的指引。

## 状态概览

| 阶段 | 状态 | 摘要 |
| --- | --- | --- |
| Stage 0 · Docker + Postgres + Auth | 🟢 | compose（web/backend/worker/postgres/redis/proxy）+ Auth.js（`lib/auth.ts` + Edge `lib/auth.config.ts` + `middleware.ts`）+ HMAC 服务身份 + `db/init` auth 表 + Alembic |
| Stage 1 · 后端数据 API | 🟢 | `/v1/data/*`（12 资源）+ `/v1/vectors` + `/v1/training/*` 全套 + `/v1/audit` + `/v1/realtime` + `/v1/plugins`；前端数据层 `lib/client/*` + React Query（`@/lib/hooks`） |
| Stage 2 · Agent 运行时核心 | 🟡 | durable run API（threads/runs/SSE/resume/cancel）+ `AgentHarness` + LangGraph + Postgres checkpointer + worker 均就绪；DeepSeek `bind_tools` + SSE 流式已接入；状态机契约测试（幂等/resume/cancel/SSE 续传/worker）已补；**剩余** 目标环境验活 `deepseek-v4-flash` |
| Stage 3 · MCP 客户端 + 服务端 | 🟢 | 工具注册表 + SSRF/2 MiB 守卫 + FastMCP server + streamable-HTTP 客户端池 + `/v1/mcp` REST（`ischolar.*` 仅经受签名 REST） |
| Stage 4 · 迁移 7 个智能体 | 🟢 | 7 张图 + prompts + `contextFrom` 产物检索 + Pydantic 结构化输出；Agent UI 走后端 |
| Stage 5 · 评估 harness | 🟢 | 离线数据集 + 确定性检查 + 阈值报告 + `EVAL_MODE=live` + 可选 LLM judge；无 CI |
| Stage 6 · Hermes/训练/插件/清理 | 🟢 | Hermes 图、插件按用户 Postgres、遗留直连路由已删除；可检查点多轮教练图、按用户声明式插件工具均已落地 |
| 遗留栈（Dexie/Supabase） | ⚪ | `lib/local/*`、`lib/supabase/*`、`lib/lms/*`、`@supabase/*`、`dexie` 全部删除 |

## 待办（剩余）

### Stage 2 — Agent 运行时
- 🟢 DeepSeek `bind_tools`（模型驱动工具调用）与 SSE 流式已接入：`model.py`（`ToolSpec`/`ToolCall`/`stream`）、`harness.stream_model`（`message.delta`）、`_common.run_agent_draft` 工具循环；前端 `subscribeRunEvents` 增量渲染。**剩余**：目标环境验活 `deepseek-v4-flash` 工具调用。
- 🟢 `/v1/agent/*` 状态机契约测试：`tests/conftest.py`（Postgres 事务回滚 + `get_session` 覆盖）+ `tests/test_agent_state_machine.py`（幂等/owner 级唯一、resume 守卫与流转、cancel、SSE `after` 续传、worker interrupt→resume→succeeded）；`test_agent_contract.py` 增离线校验/401/SSE 帧。无库时自动 skip。

### Stage 6 — 收尾
- 🟢 可检查点多轮教练图：`training.py` 用 `add_messages` reducer 在 `thread_id` 检查点累积对话（复用同一 thread 即多轮，客户端 `runAgentStream` 支持可选 `threadId`）；回复经 `draft.text` 流式返回。
- 🟢 按用户声明式插件 MCP 工具：`app/mcp/plugin_tools.py`（解析/校验/执行 + `load_user_tools` 按 owner 解析）；`execute_run` 为 `p.<plugin>.<key>` 注入 owner 工具，`AgentHarness` 与 `/v1/mcp` 调用复用 SSRF/2 MiB 守卫；敏感头剥离、不进全局注册表、不在共享 MCP 服务端暴露。测试 `tests/test_plugin_tools.py` + `test_plugin_tools_db.py`。

### Stage 5 — 评估（可选）
- ⚪ CI 作业：仓库无 CI（无 `.github/`）；本地 `pnpm agent:eval` 可用。

### P2 — 产品增强
- ⚪ PWA 离线；本地数据加密；多人实时编辑（CRDT/WebRTC 或 Realtime）。
- ⚪ 完整 LTI 1.3（Resource Link 启动 / OIDC、Deep Linking、NRPS 花名册同步）。
- ⚪ 邀请落地页增强、邮件催交 webhook、审核多人指派。

### 文档
- 🟢 2026-09-30 文档同步：`README.md` 全量刷新；7 份 `doc/*` 去除「重构进行中」横幅与旧栈附录，订正已删除脚本/文件/环境变量引用；`docker-compose.yml` / `docker/web.Dockerfile` 移除 `NEXT_PUBLIC_DATA_BACKEND`/`NEXT_PUBLIC_COLLABORATIVE_MODE`；`package.json` 描述订正。
- 🟡 每次新增/修改 Alembic 迁移后同步 `doc/database.md`（迁移表已补 `0006`–`0012`）。

## 已完成里程碑

- **Stage 0**：全栈 Docker + Auth.js + HMAC 身份 + Alembic；`middleware.ts` Edge 守卫应用路由。
- **Stage 1**：科研核心 12 个 `/v1/data/*` + blob 存储 + `/v1/vectors`；训练/组织/LMS 全套 `/v1/training`（analytics/export/LMS gradebook/consents/evidence）；`/v1/audit`（同意 + SHA-256 链）、`/v1/realtime` SSE、`/v1/plugins`；前端全量迁移到 BFF + React Query，**19 个旧训练路由删除**。
- **Stage 3**：内置 + `ischolar.*` 工具注册表、SSRF/2 MiB 守卫、FastMCP server、客户端池、`/v1/mcp` REST + BFF 适配器；请求体限长中间件。
- **Stage 4**：7 张按智能体图 + Hermes 图、prompts、结构化输出、Fake/DeepSeek 模型、legacy 奇偶校验；Agent UI 走后端 `/api/agent`，产物面板/步进读 `listRuns`。
- **Stage 5**：离线评估（数据集/检查/阈值报告/可选 judge）。
- **隐私守卫**：`app/privacy/sensitive_content.py`（移植自 web），`/v1/training/me` 提交与 evidence 创建/更新处服务端强制 `400 SENSITIVE_CONTENT`。
- **遗留清理**：删除 `lib/local/*`、`lib/supabase/*`、`lib/lms/*`、遗留 server helper、Supabase 目录/脚本/E2E spec，及 `@supabase/*`/`dexie`/`@huggingface/transformers` 依赖与环境变量；`@/lib/hooks` 现为 `lib/client/hooks` 的纯 re-export。

## 验证现状（2026-09-30）

| 项 | 结果 |
| --- | --- |
| 后端 `ruff check` | 🟢 0 |
| 后端 `pytest` | 🟢 161 passed（DB 可达）/ 离线 150 passed + 11 skipped |
| 评估 `services/eval` | 🟢 `ruff` 0 / `pytest` 7 |
| 前端 `tsc` / `lint` | 🟢 通过 |
| 前端 `vitest` | 🟢 44 文件 / 202 用例 |
| 前端 `build` | 🟢 通过 |
| `docker compose config` | 🟢 通过（base + dev） |
| Alembic | 12 迁移，head `20260929_0012` |

## 变更日志

- 🟢 2026-09-30：Stage 6 收尾：多轮可检查点教练图 + 按用户声明式插件 MCP 工具（`plugin_tools.py`、harness/runtime 注入、`/v1/mcp` 列出/调用）。
- 🟢 2026-09-30：文档与基础设施同步（README + 7 份 `doc/*` 去旧栈；compose/Dockerfile 清理 `NEXT_PUBLIC_*`；`package.json` 描述）。
- 🟢 2026-09-30：`/v1/agent/*` 状态机契约测试（`conftest.py` + DB-backed 集成，离线自动 skip）。
- 🟢 2026-09-30：Stage 2 接入 DeepSeek `bind_tools` + SSE 流式（模型驱动工具循环、`message.delta`、前端增量渲染）。
- 🟢 2026-09-30：隐私守卫移植 + 代码复核修复（`in_progress` 草稿、产物状态步进、清理死配置）。
- 🟢 2026-09-30：P1 迁移收尾（T1–T3 + D）：训练/智能体前端全迁移、旧路由删除、遗留数据层与依赖移除。
- 🟢 2026-09-30：全仓审计加固：旧 API 鉴权、同意统一 `ai_consents_v2`、后端鉴权/完整性、基础设施与测试清理。
- 🟢 2026-09-28：Stage 1c（`/v1/audit`、`/v1/realtime`、插件落 Postgres）。
- 🟢 2026-09-27：Stage 3 MCP / Stage 4 七智能体 / Stage 5 judge / Hermes；E2E 适配 Auth.js。
- 🟢 2026-09-27：Stage 1b（训练/组织/LMS 后端 + 全套路由）。
- 🟢 2026-09-25：Stage 1a（科研核心 12 资源 + `/v1/vectors` + BFF 代理）。
- 🟢 2026-09-24：Stage 0 完成（全栈 Docker + Auth.js + Alembic）。

## 文档维护清单

| 文档 | 用途 |
| --- | --- |
| `doc/architecture.md` | web/backend 分层、服务身份、LangGraph、数据流 |
| `doc/database.md` | Alembic 迁移、Postgres 表、auth 表、pgvector、PII 门 |
| `doc/development.md` | 环境、命令、服务边界、添加智能体、i18n/主题 |
| `doc/deployment.md` | Docker Compose、Caddy/HTTPS、环境变量、迁移 |
| `doc/usage.md` / `doc/examples.md` | 用户路径与智能体输入/输出示例 |
| `doc/plugins.md` / `doc/lms.md` / `doc/training-packs.md` | 专项功能说明 |
| `IMPLEMENTATION_PLAN.md` / `README.md` / `AGENTS.md` | 权威路线图 / 入口说明 / AI 助理指引 |

---

*本文件反映仓库实现状态；锁定决策与总方向以 `IMPLEMENTATION_PLAN.md` 为准。*
