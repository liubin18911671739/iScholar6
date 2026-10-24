# TODO.md — iScholar v6.0 路线图

> 最近更新：2026-10-24
> 状态：🔴 未开始 | 🟡 进行中 | 🟢 已完成 | ⚪ 可选 / 本轮 defer
> 方向以 [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) 为准；本文件跟踪执行进度与验证。
> `CLAUDE.md` / `AGENTS.md` 已删除（分别描述旧栈与旧流程）；AI 助理指引以本文件与 `IMPLEMENTATION_PLAN.md` 为准。

## 状态概览

| 阶段 | 状态 | 摘要 |
| --- | --- | --- |
| Stage 0 · Docker + Postgres + Auth | 🟢 | compose（web/backend/worker/postgres/redis/proxy）+ Auth.js（`lib/auth.ts` + Edge `lib/auth.config.ts` + `middleware.ts`）+ HMAC 服务身份 + `db/init` auth 表 + Alembic |
| Stage 1 · 后端数据 API | 🟢 | `/v1/data/*`（12 资源）+ `/v1/vectors` + `/v1/training/*` 全套 + `/v1/audit` + `/v1/realtime` + `/v1/plugins`；前端数据层 `lib/client/*` + React Query（`@/lib/hooks`） |
| Stage 2 · Agent 运行时核心 | 🟢 | durable run API（threads/runs/SSE/resume/cancel）+ `AgentHarness` + LangGraph + Postgres checkpointer + worker；DeepSeek `bind_tools` + SSE 流式接入；状态机契约测试齐；**live 冒烟 `deepseek-v4-flash` 双用例通过** |
| Stage 3 · MCP 客户端 + 服务端 | 🟢 | 工具注册表 + SSRF/2 MiB 守卫 + FastMCP server + streamable-HTTP 客户端池 + `/v1/mcp` REST（`ischolar.*` 仅经受签名 REST） |
| Stage 4 · 迁移 7 个智能体 | 🟢 | 7 张图 + prompts + `contextFrom` 产物检索 + Pydantic 结构化输出；Agent UI 走后端 |
| Stage 5 · 评估 harness | 🟢 | 离线数据集 + 确定性检查 + 阈值报告 + `EVAL_MODE=live` + 可选 LLM judge；无 CI |
| Stage 6 · Hermes/训练/插件/清理 | 🟢 | Hermes 图、插件按用户 Postgres、遗留直连路由已删除；可检查点多轮教练图、按用户声明式插件工具均已落地 |
| 遗留栈（Dexie/Supabase） | ⚪ | `lib/local/*`、`lib/supabase/*`、`lib/lms/*`、`@supabase/*`、`dexie` 全部删除 |

## 待办（剩余）

### 多智能体协作（Stage 7，2026-10-23）
- 🟢 运行与审批可靠性：worker 租约（`lease_token`/`lease_expires_at`/`attempt`，迁移 `20261023_0014`）+ 心跳 + reaper（过期回收/取消/上限失败）+ 条件终结栅栏；事件改为逐条提交（SSE 实时可见）；`stream_model` 边生成边发 delta；审批端点自动恢复 WAITING_FOR_REVIEW 运行（并发重复决策 409）；生产环境缺模型密钥/占位 token 启动即失败。测试 `tests/test_worker_lease.py` + `tests/test_config_validation.py`。
- 🟢 工具和模型统一接线：harness 注入执行上下文（owner/project），`ischolar.*` 工具在 harness 层强制身份绑定；工具预算按 started 计费（失败也计入）；`agent_max_tokens_per_run` token 预算；`generate_messages` 消息协议（assistant tool_calls ↔ tool 结果 id 对应）；结构化输出失败有一次带反馈修复（`schema.repaired` 事件）；模型 temperature/timeout/retries 配置化；远程 MCP 客户端池接线（发现缓存 TTL 300s、`mcp.<server>.<tool>` 命名空间、harness 统一授权）+ FastMCP 服务端挂载 `/mcp`。测试 `tests/test_harness.py`、`tests/test_mcp_pool.py`、`test_agent_model.py` 扩展。
- 🟢 多 Agent 协作图：`research-plan` 工作流（`graphs/research_plan.py`）：intake→topic→gate(选题)→litreview→design→quality(规则+LLM)→bounded revise(≤1)→summary→gate(终审)；步骤产物复用内建 artifact kind，终审批准/拒绝应用于全链产物；`run.interrupted` 事件携带结构化门控载荷。测试 `tests/test_research_plan.py`（双门/中止/有界返工）。
- 🟢 前端工作台：`research-plan` 注册（registry/stages/prompt-resolve/AGENT estimations）；`/projects/[projectId]/research-plan` 页；WorkflowPanel（阶段 chips、选题门、终审门、质检徽章，刷新后由后端状态重建）；SSE `onEvent` 转发 step/interrupted 事件；i18n 双语；项目布局新增入口 tab。
- 🟢 协作评测：eval 增加 `research-plan-workflow`（steps 覆盖/质检结论/最终产物检查）与 `data-basic`；live 模式对门控自动批准最多 2 次并评测整链 result；quality-gate 纳入 backend/eval pytest + 离线 eval（可选步骤）。
- 🟢 真实 `deepseek-v4-flash` 环境对完整协作链（工具调用+流式+双门）live 冒烟：`research-plan-workflow` 通过（见 Stage 2 小节 2026-10-24 条目）。DeepSeek 高峰下偶发轮询超时，单独重跑即过；全量 live 两轮 score 0.875。

### Stage 2 — Agent 运行时
- 🟢 DeepSeek `bind_tools`（模型驱动工具调用）与 SSE 流式已接入：`model.py`（`ToolSpec`/`ToolCall`/`stream`）、`harness.stream_model`（`message.delta`）、`_common.run_agent_draft` 工具循环；前端 `subscribeRunEvents` 增量渲染。
- 🟢 `/v1/agent/*` 状态机契约测试：`tests/conftest.py`（Postgres 事务回滚 + `get_session` 覆盖）+ `tests/test_agent_state_machine.py`（幂等/owner 级唯一、resume 守卫与流转、cancel、SSE `after` 续传、worker interrupt→resume→succeeded）；`test_agent_contract.py` 增离线校验/401/SSE 帧。无库时自动 skip。
- 🟢 2026-10-24 目标环境验活 `deepseek-v4-flash`：live 冒烟通过工具调用 + 流式 + 双门协作全链（`EVAL_CASES=topic-basic` 与 `research-plan-workflow` 均 score 1.0；全量 8 用例两轮 PASS，score 0.875）。验活期间修出三个真隐患：容器 DNS 转发失效（compose 增可覆盖 `CONTAINER_DNS_*`）、`finalize_run_failed` 漏写 `status=FAILED` 且 asyncpg `RETURNING` 无 rowcount（补回归测试）、eval 签名只生成一次致长轮询 401（改每请求重签）。

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
- 🟢 每次新增/修改 Alembic 迁移后同步 `doc/database.md`（迁移表已补至 `0014`；后续新增迁移保持同步）。

### 运维 / 环境（2026-10-04）
- 🟢 向量检索落地：迁移 `20260929_0013` 为 `bib_items`/`rag_chunks.embedding` 建 HNSW 余弦索引；`/v1/vectors/search` 支持 `bib_items`/`rag_chunks`/`both` 目标与 `score`（1−cosine_distance）；`backend` 镜像切到 `vectors` target（torch CPU wheel + 清华镜像）；模型下载走 `HF_ENDPOINT`（默认 hf-mirror）并落 `hfcache` 共享卷；容器级冒烟 + 回填验证全过。
- 🟢 登录限流修复：`lib/auth.ts` 仅对失败登录计数且成功即清零（此前成功登录也计数且不清零，第 11 次起误伤合法用户）；E2E 由 22/51 → 51/51。
- 🟢 新增 `__tests__/api/training-proxy.test.ts`（训练 BFF 代理契约 5 用例，全套 vitest 45 文件/207 用例）。
- 🟡 邀请邮件链路代码完备（`lib/server/smtp.ts` 依赖 `SMTP_*`；缺配置时优雅降级 `sent:false`），但生产 `.env` 未填真实凭证；上线前填写并验证一次邀请激活流程。

## 已完成里程碑

- **Stage 0**：全栈 Docker + Auth.js + HMAC 身份 + Alembic；`middleware.ts` Edge 守卫应用路由。
- **Stage 1**：科研核心 12 个 `/v1/data/*` + blob 存储 + `/v1/vectors`；训练/组织/LMS 全套 `/v1/training`（analytics/export/LMS gradebook/consents/evidence）；`/v1/audit`（同意 + SHA-256 链）、`/v1/realtime` SSE、`/v1/plugins`；前端全量迁移到 BFF + React Query，**19 个旧训练路由删除**。
- **Stage 3**：内置 + `ischolar.*` 工具注册表、SSRF/2 MiB 守卫、FastMCP server、客户端池、`/v1/mcp` REST + BFF 适配器；请求体限长中间件。
- **Stage 4**：7 张按智能体图 + Hermes 图、prompts、结构化输出、Fake/DeepSeek 模型、legacy 奇偶校验；Agent UI 走后端 `/api/agent`，产物面板/步进读 `listRuns`。
- **Stage 5**：离线评估（数据集/检查/阈值报告/可选 judge）。
- **隐私守卫**：`app/privacy/sensitive_content.py`（移植自 web），`/v1/training/me` 提交与 evidence 创建/更新处服务端强制 `400 SENSITIVE_CONTENT`。
- **遗留清理**：删除 `lib/local/*`、`lib/supabase/*`、`lib/lms/*`、遗留 server helper、Supabase 目录/脚本/E2E spec，及 `@supabase/*`/`dexie`/`@huggingface/transformers` 依赖与环境变量；`@/lib/hooks` 现为 `lib/client/hooks` 的纯 re-export。

## 验证现状（2026-10-23）

| 项 | 结果 |
| --- | --- |
| 后端 `ruff check` | 🟢 0 |
| 后端 `pytest` | 🟢 207 passed（含 worker 租约/harness/MCP 池/协作图/配置校验 + `finalize_run_failed` 回归；Docker 内 DB 可达，离线自动 skip） |
| 评估 `services/eval` | 🟢 `ruff` 0 / `pytest` 7 |
| 前端 `tsc` / `lint` | 🟢 通过 |
| 前端 `vitest` | 🟢 45 文件 / 208 用例 |
| 前端 `build` / `test:e2e` | 🟢 上轮全绿（2026-10-04：build 通过、E2E 51/51；本轮未重跑） |
| live 冒烟 `deepseek-v4-flash` | 🟢 2026-10-24：`topic-basic` + `research-plan-workflow` score 1.0；全量 8 用例两轮 PASS（0.875） |
| 向量容器验证 | 🟢 `/v1/vectors` 冒烟（三种 target + score）+ worker 回填 5s 内落库（2026-10-04） |
| `docker compose config` | 🟢 通过（base + vectors profile） |
| Alembic | 14 迁移，head `20261023_0014`（run 租约） |

## 变更日志

- 🟢 2026-10-24：Stage 2 收官（目标环境验活 `deepseek-v4-flash`）：eval harness 支持 `EVAL_CASES` 聚焦与 `EVAL_TIMEOUT_SECONDS` 超时、上次 per-request 重签名；三个真隐患修复——容器 DNS（compose `CONTAINER_DNS_*`）、`finalize_run_failed` 漏 `status=FAILED` + asyncpg `RETURNING` 无 rowcount（补回归测试）、工具名线上别名（`scholar.search` → `scholar_search` 往返）；`.env.example` 补 `EVAL_*`/DNS 说明；`alembic stamp head` 修复无版本标记 DB；live 冒烟 topic×2 + research-plan 多轮 + 全量两轮均 PASS。

- 🟢 2026-10-23：Stage 7 多智能体协作收口：worker 租约/心跳/reaper + 逐条事件提交 + `stream_model` 流式 delta + 审批端点自动恢复 + 生产启动校验；harness 执行上下文/token 预算/消息协议/结构化输出自修复/远程 MCP 池接线；`research-plan` 双门协作图 + 前端 WorkflowPanel + 协作评测数据集；迁移 `20261023_0014`；删除 `AGENTS.md`/`CLAUDE.md`。质量门：ruff 0、pytest 206、eval 7、lint/tsc 通过、vitest 208。

- 🟢 2026-10-04：向量落地收口：`20260929_0013` HNSW 余弦索引；`/v1/vectors/search` 增 `bib_items`/`rag_chunks`/`both` 目标与 `score`，`/embed`/`/status` 收紧签名身份；`backend` 服务切 `vectors` target（torch CPU wheel、清华镜像），`HF_ENDPOINT`（hf-mirror）+ `hfcache` 共享卷；容器级三个 target 冒烟与 worker 回填验证全过。
- 🟢 2026-10-04：修复 `lib/auth.ts` 登录限流（成功登录也计数且不清零 → 仅失败计数、成功清零），E2E 22/51 → **51/51**；新增 `__tests__/api/training-proxy.test.ts`（5 用例）；全套质量门重跑（ruff/pytest 169、lint/tsc/vitest 207、build、e2e 51）。
- 🟢 2026-10-04：文档同步：`IMPLEMENTATION_PLAN.md` Stage 1 置 🟢 并订正交付物（训练 BFF catch-all、向量全栈说明）；部署库重建至 `0013` 并回灌 users/projects。
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
| `IMPLEMENTATION_PLAN.md` / `README.md` | 权威路线图 / 入口说明 |

---

*本文件反映仓库实现状态；锁定决策与总方向以 `IMPLEMENTATION_PLAN.md` 为准。*
