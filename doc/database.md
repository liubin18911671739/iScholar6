# 数据库结构说明

> 平台使用**单一 PostgreSQL 16 + pgvector**。领域表由 Python 后端拥有、经 Alembic 迁移；auth 表由 web 容器（Auth.js）拥有。
> 旧的两层存储（Dexie/IndexedDB + Supabase）已完全移除（`lib/local/*`、`lib/supabase/*`、`supabase/`）。
>
> 相关：[系统架构](./architecture.md) · [部署指南](./deployment.md) · [`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md)

---

## 1. 所有权模型

| 数据 | 所有者 | 访问方式 | schema 来源 |
| --- | --- | --- | --- |
| auth 表（`users` / `accounts` / `verification_token`） | web 容器 | `AUTH_DATABASE_URL` 窄连接池 | `db/init/001_auth.sql` |
| 领域表（`projects`、`agent_*`、`artifacts`、`evidence`、后续训练/组织表） | Python 后端 | 仅经 `/v1/*` | Alembic（`services/backend/alembic/versions/`） |
| 扩展 / 函数（`pgcrypto`、`citext`、`vector`、`set_updated_at`） | 数据库 | — | `db/init/000_extensions.sql`、`001_auth.sql` |

**边界规则**：

- 后端**不得**写 auth 表。
- web **不得**写领域表；一律经签名 BFF 调 `/v1/*`。
- 领域表外键可引用 `users(id)`，但写入由后端负责。

### 两个连接串

| 变量 | 驱动 | 使用者 | 用途 |
| --- | --- | --- | --- |
| `DATABASE_URL` | `asyncpg`（`postgresql+asyncpg://`） | backend / Alembic | 领域读写 |
| `AUTH_DATABASE_URL` | libpq（`postgresql://`） | web / Auth.js 适配器 | 仅 auth 表 |

---

## 2. 初始化与迁移

```text
容器首次初始化（空数据卷）
  └─ db/init/*.sql 按文件名顺序执行 → 扩展 + auth 表 + set_updated_at()

每次部署 / backend 启动前
  └─ migrate 服务：alembic upgrade head → 领域表
```

- **扩展与 auth 表**只在空数据卷执行一次；已有卷不会重跑。重建需 `docker compose down -v`（删除数据）。
- **领域表**用 Alembic。新增 schema 变更：新增 revision，**不要**改已应用版本。
- 迁移文件命名 `YYYYMMDD_NNNN_description.py`。

### 现有迁移

| Revision | 内容 |
| --- | --- |
| `20260920_0001_agent_platform` | `projects`、`agent_threads`、`agent_runs_v2`、`agent_run_events`、`artifacts`、`evidence` |
| `20260920_0002_consent_resume` | 同意与运行恢复相关（`ai_consents_v2`、`resume_input` 等） |
| `20260925_0003_research_core` | 科研核心表（`manuscripts`…`tasks`）+ `projects` 客户端字段 + owner 列指向 `users(id)` 的 FK |
| `20260927_0004_training_org_lms` | 训练/组织/LMS 表（`training_programs`…`training_lms_links`、`organizations`、`organization_members`）+ identity 列指向 `users(id)` 的 FK + seed 默认组织 |
| `20260927_0005_consent_audit` | `ai_consents_v2` 增 `program_id`/`training_task_id`/`purpose`/`data_categories`/`sensitive_scan`；新增 `audit_ledger`（SHA-256 哈希链） |
| `20260927_0006_plugins` | 按用户插件安装/提示词包（`plugin_installs`、`prompt_pack_selections`） |
| `20260928_0007_audit_chain_hash` | `audit_ledger.chain_hash`（哈希链校验列） |
| `20260928_0008_plugin_mcp_tools` | `plugin_mcp_tools`（声明式插件工具；已被 `0012` 删除） |
| `20260928_0009_agent_run_training_link` | `agent_runs_v2` 训练关联列（`training_task_id`/`program_id`/`mode`） |
| `20260929_0010_consent_project_nullable` | `ai_consents_v2.project_id` 允许为空（训练提交按 program 记录同意） |
| `20260929_0011_agent_idempotency_owner_scoped` | 幂等键改为 `UNIQUE(owner_id, idempotency_key)` |
| `20260929_0012_drop_plugin_mcp_tools` | 删除未接线的 `plugin_mcp_tools` 表 |

> 新增迁移后同步更新本表与 `doc/architecture.md` 的数据层说明。

---

## 3. auth 表（web 所有）

`db/init/001_auth.sql`：

| 表 | 关键列 | 说明 |
| --- | --- | --- |
| `users` | `id`、`email`(citext, unique)、`password_hash`、`name`、`image`、`role` | 凭据用户；`role ∈ {learner, librarian, admin}`；`updated_at` 由触发器维护 |
| `accounts` | `user_id`、`provider`、`provider_account_id`、tokens | Auth.js 适配器兼容表；仅 Credentials 时未使用 |
| `verification_token` | `identifier`、`token`、`expires` | 适配器兼容 |

`users.id` 是领域表 `owner_id` 的来源（由 web 签名转发，后端校验后使用）。

密码校验逻辑在 `lib/auth/password.ts`（bcrypt），查询在 `lib/auth/users.ts`。

---

## 4. 领域表（后端所有）

来源：`services/backend/app/models/domain.py` + 迁移 `20260920_0001`。

### 4.1 核心表

| 表 | 关键列 | 说明 |
| --- | --- | --- |
| `projects` | `id`、`owner_id`(idx)、`name`、`description`、`created_at`、`updated_at` | 领域根实体 |
| `ai_consents_v2` | `id`、`project_id`(FK, nullable)、`program_id`(FK, nullable)、`owner_id`、`external_services`(JSON)、`redaction_confirmed`、`purpose`、`created_at` | 外部服务同意证明（`training_submit` 同意按 program，可无 project） |
| `agent_threads` | `id`、`project_id`(FK)、`owner_id`、`title`、`created_at` | 会话线程 |
| `agent_runs_v2` | `id`、`thread_id`(FK)、`project_id`(FK)、`owner_id`、`agent`、`goal`、`input`(JSONB)、`resume_input`(JSONB)、`status`、`consent_id`、`cancel_requested`、`idempotency_key`；`UNIQUE(owner_id, idempotency_key)`、`error`、`result`(JSONB)、时间戳 | Agent 运行 |
| `agent_run_events` | `id`、`run_id`(FK)、`sequence`、`type`、`data`(JSONB)、`created_at`；`UNIQUE(run_id, sequence)` | 运行事件（SSE 来源） |
| `artifacts` | `id`、`run_id`(FK)、`project_id`(FK)、`kind`、`status`、`content`(JSONB)、`idempotency_key`、`reviewed_at`、`created_at`；`UNIQUE(run_id, idempotency_key)` | 幂等产物 |
| `evidence` | `id`、`run_id`(FK)、`title`、`source_url`、`doi`、`excerpt`、`verified`、`metadata`(JSONB)、`created_at` | 证据 |

> JSON 列在模型中声明为 `JSON`，在迁移中映射为 `JSONB`。

### 4.2 运行状态

`RunStatus`（`domain.py`）：`queued` / `running` / `waiting_for_input` / `waiting_for_review` / `succeeded` / `failed` / `cancelled`。

- `agent_runs_v2(status, created_at)` 建索引 `ix_agent_runs_v2_worker` 供 worker 领取。
- `cancel_requested` 为协作式取消标志；`resume_input` 保存审批/补充数据。

### 4.3 关系图（含级联）

```text
projects ──┬─(N) agent_threads ──(N) agent_runs_v2 ──┬─(N) agent_run_events
           ├─(N) ai_consents_v2                     ├─(N) artifacts
           └─(N) agent_runs_v2                      └─(N) evidence

所有 FK 均为 ON DELETE CASCADE：删除项目即级联清除线程/运行/事件/产物/证据。
```

### 4.4 授权

所有查询按签名身份解析的 `owner_id` 过滤（`owned_project` / `owned_run`），不匹配返回 `404`。组织/训练营级别的细粒度授权在 `app/core/authz.py`（纯策略函数）中定义，Stage 1b 接入。

> **身份外键**：`owner_id` 列在数据库中通过迁移 `20260925_0003` 引用 `users(id)`；ORM 模型**不**声明该 FK（auth 表由 web 所有、后端不建模），因此 `alembic revision --autogenerate` 不应作为 schema 来源，一律手写迁移。

### 4.5 科研核心表（迁移 `20260925_0003`）

| 表 | 关键列 | 说明 |
| --- | --- | --- |
| `manuscripts` | `id`、`project_id`(FK)、`title`、`abstract`、`current_version`、`target_journal`、`status`、`updated_at` | 稿件 |
| `manuscript_blocks` | `id`、`manuscript_id`(FK)、`section`、`ordinal`、`content`、`version`、`author_type`、`agent_run_id`、`updated_at` | 有序区块 |
| `manuscript_versions` | `id`、`manuscript_id`(FK)、`block_id`、`version`、`content`、`author_type`、`agent_run_id`、`content_hash`、`created_at` | 版本快照 |
| `bib_items` | `id`、`project_id`(FK)、`doi`、`title`、`authors`(JSON)、`year`、`venue`、`abstract`、`keywords`(JSON)、`citation_count`、`metadata`(JSON)、`embedding`(vector 384)、`created_at` | 文献条目 |
| `attachments` | `id`、`project_id`(FK)、`bib_item_id`(FK)、`filename`、`storage_path`、`content_hash`、`mime_type`、`size_bytes`、`encrypted`、`created_at` | 附件元数据；blob 在文件系统卷 |
| `rag_chunks` | `id`、`bib_item_id`(FK)、`chunk_index`、`content`、`embedding`(vector 384) | 检索块 |
| `experiments` | `id`、`project_id`(FK)、`name`、`dataset`、`params`(JSON)、`results`(JSON)、`script_blob_url`、`created_at` | 实验 |
| `submissions` | `id`、`project_id`(FK)、`manuscript_id`(FK)、`journal_name`、`cover_letter`、`file_tree`(JSON)、`submitted_at`、`status` | 投稿 |
| `review_rounds` | `id`、`submission_id`(FK)、`round_number`、`decision`、`review_text`、`deadline` | 审稿轮次 |
| `rebuttal_items` | `id`、`review_round_id`(FK)、`reviewer_comment`、`response`、`change_location`、`evidence`(JSON) | 返修条目 |
| `tasks` | `id`、`project_id`(FK)、`title`、`description`、`status`、`assignee`、`due_date`、`created_by` | 项目任务 |

主键统一为**后端生成的 UUID**（不同于旧 Supabase 的 text id）。`projects` 同迁移新增 `status`/`discipline`/`goal`/`encryption_key_ref`/`metadata` 列以对齐客户端模型。

### 4.6 数据 API（`/v1/data/*`）

`app/api/v1/data/` 包：`projects`、`manuscripts`、`manuscript-blocks`（reorder / 快照 / `rollback`）、`manuscript-versions`、`bib-items`（含 `bulk`）、`rag-chunks`、`attachments`（multipart 上传 / 鉴权下载）、`experiments`、`submissions`、`review-rounds`、`rebuttal-items`、`tasks` 共 12 资源。JSON 收发为 **camelCase**（`CamelModel` 别名生成）；鉴权用签名身份解析的 `owner_id`，跨用户返回 `404`。blocks 的内容快照与哈希由后端负责。

### 4.7 训练 / 组织 / LMS 表（迁移 `20260927_0004`）

来源：`services/backend/app/models/training.py`。identity 列（`owner_id` / `learner_id` / `reviewer_id` / `created_by` / `user_id` / `reviewer_learner_id`）在迁移中加 FK → `users(id)`，ORM **不**声明。

| 表 | 关键列 | 说明 |
| --- | --- | --- |
| `organizations` | `id`、`name`、`slug`(unique)、`created_at` | 租户边界；迁移 seed `default` 组织 |
| `organization_members` | `org_id`(FK)+`user_id`(PK)、`role`(`org_admin`/`librarian`/`viewer`)、`created_at` | 组织成员（复合主键） |
| `training_programs` | `id`、`name`、`owner_id`、`cohort_name`、`start_date`、`end_date`、`max_members`、`status`、`organization_id`(FK)、时间戳 | 训练营（camp） |
| `training_enrollments` | `id`、`program_id`(FK)、`learner_id`、`status`、`role`(`learner`/`ta`)、`last_nudged_at`、`joined_at`；`UNIQUE(program_id, learner_id)` | 报名 / 助教 |
| `training_submissions` | `id`、`program_id`(FK)、`task_id`、`learner_id`、`answers`(JSONB)、`reflection`、`status`、`peer_status`、`claimed_by`、`claimed_at`、`updated_at`；`UNIQUE(program_id, task_id, learner_id)` | 提交 |
| `training_reviews` | `id`、`submission_id`(FK)、`reviewer_id`、`decision`、`feedback`、`score`(0–100)、`created_at` | 评审 |
| `training_tasks` | `id`(text)、`program_id`(FK)、`project_id`、`title`、`dimension`、`steps`(JSONB)、`status`、`requires_review`、时间戳 | 旧本地实体镜像 |
| `evidence_cards` | `id`(text)、`submission_id`(text)、`project_id`、`claim`、`verification_status`、`evidence_strength`、`bib_item_id` | 证据卡 |
| `training_program_tasks` | `id`、`program_id`(FK)、`task_id`、`ordinal`、`due_at`、`required`、`requires_review_override`；`UNIQUE(program_id, task_id)` | 课程表 |
| `training_task_packs` | `id`、`pack_key`(unique)、`name`、`source`、`manifest`(JSONB)、`organization_id`(FK) | 任务包 |
| `training_task_definitions` | `id`(text)、`pack_id`(FK)、`agent`、`dimension`、`steps`(JSONB)、`peer_review` | 任务定义 |
| `training_certificates` | `id`(text)、`program_id`(FK)、`learner_id`、`content_hash`(unique)、`payload`(JSONB)、`issued_at` | 结业证 |
| `training_peer_assignments` | `id`、`submission_id`(FK unique)、`program_id`(FK)、`reviewer_learner_id`、`status` | 互评分配 |
| `training_peer_reviews` | `id`、`assignment_id`(FK unique)、`decision`、`score`、`evidence_card_ids`(text[]) | 互评结果 |
| `training_lms_links` | `id`、`program_id`(FK unique)、`platform`、`client_secret`、`ags_lineitem_url`、`last_push_*` | LMS/LTI AGS（密钥仅服务端） |

API：`/v1/training/*` — programs / enrollments / tasks / progress / report / organizations / submissions（+`/submissions/{id}/evidence`）/ evidence（`PATCH /evidence/{id}`）/ me / reviews / peer / certificates（+`verify`、`me/certificate`）/ consents / nudge / task-packs / calendar / analytics/dashboard / export / lms（link、gradebook）。授权由 `app/core/authz.py` 纯策略 + `app/api/v1/training/deps.py` 解析 program/org 访问；聚合逻辑在 `app/training/*`（纯函数）。旧 Supabase RLS 已被 API 层取代。

---

## 5. pgvector 与检索

状态：`bib_items.embedding` 与 `rag_chunks.embedding`（`vector(384)`）已在迁移 `20260925_0003` 建好；`/v1/vectors` embed/search/status 已落地（`app/vectors/*`，`sentence-transformers` 通过 `[vectors]` extra 安装，未安装时返回 503）。

- 启用 `vector` 扩展（`db/init/000_extensions.sql`）。
- 文献/RAG 文本块的嵌入在**服务端**计算并存入 `vector` 列。
- 相似检索用 pgvector 距离算子；Top-K 返回后由后端组装。

> 旧实现为浏览器端 Transformers.js（`Xenova/all-MiniLM-L6-v2`，384 维），随 `lib/local/*` 删除。

---

## 6. 审计与同意

- **同意**：`ai_consents_v2`（迁移 `20260927_0005` 扩展 `program_id`/`training_task_id`/`purpose`/`data_categories`/`sensitive_scan`）。训练提交要求匹配 program、`purpose='training_submit'`、`redaction_confirmed=true` 且 30 分钟内的同意证明，否则 `403 CONSENT_*`。
- **审计**：`audit_ledger`（迁移 `20260927_0005`）为 SHA-256 哈希链（`entry[N].parent_hash == entry[N-1].output_hash`）；`/v1/training/me`、`/reviews`、`/peer` 已落库，客户端账本随 `lib/local/*` 删除。
- **PII 门**：`app/privacy/sensitive_content.py` 镜像 web 端正则；`/v1/training/me` 提交与证据卡创建/更新（`POST /submissions/{id}/evidence`、`PATCH /evidence/{id}`）在**服务端**拒绝明显敏感内容（`400 SENSITIVE_CONTENT`），`tests/test_privacy.py` 覆盖。

---

## 7. Schema 变更 Checklist（P0）

| 变更类型 | 必须动作 |
| --- | --- |
| 领域表 / 列 | 新增 Alembic revision → `alembic upgrade head` → 更新本文件与 `architecture.md` |
| auth 表 | 修改 `db/init/001_auth.sql`（注意：空数据卷才执行）→ 更新本文件 |
| 授权规则 | 更新 `app/core/authz.py` + 对应路由 + pytest |
| 同意/审计语义 | 更新 `ai_consents_v2` 校验 + 测试 |
| 向量列 / 索引 | 新增迁移（`vector` 扩展已具备）→ 更新本文件第 5 节 |

验证：

```bash
cd services/backend
ruff check && pytest
docker compose run --rm migrate alembic upgrade head
```


