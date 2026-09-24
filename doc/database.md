# 数据库结构说明

> 目标架构使用**单一 PostgreSQL 16 + pgvector**。领域表由 Python 后端拥有、经 Alembic 迁移；auth 表由 web 容器（Auth.js）拥有。
>
> ⚠️ 重构进行中。旧的两层存储（Dexie/IndexedDB + Supabase）见文末[附录](#附录旧数据层迁移中)。
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
| `ai_consents_v2` | `id`、`project_id`(FK)、`owner_id`、`external_services`(JSON)、`redaction_confirmed`、`created_at` | 外部服务同意证明 |
| `agent_threads` | `id`、`project_id`(FK)、`owner_id`、`title`、`created_at` | 会话线程 |
| `agent_runs_v2` | `id`、`thread_id`(FK)、`project_id`(FK)、`owner_id`、`agent`、`goal`、`input`(JSONB)、`resume_input`(JSONB)、`status`、`consent_id`、`cancel_requested`、`idempotency_key`(unique)、`error`、`result`(JSONB)、时间戳 | Agent 运行 |
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

`app/api/v1/data/` 包：`projects`、`manuscripts`、`manuscript-blocks`（含 `reorder`）、`bib-items`（含 `bulk`）、`tasks`。JSON 收发为 **camelCase**（`CamelModel` 别名生成）；鉴权用签名身份解析的 `owner_id`，跨用户返回 `404`。剩余科研实体（versions/attachments/rag-chunks/experiments/submissions/review-rounds/rebuttal-items）随 1a 继续补齐。

---

## 5. pgvector 与检索

状态：`bib_items.embedding` 与 `rag_chunks.embedding`（`vector(384)`）已在迁移 `20260925_0003` 建好；服务端嵌入与 `/v1/vectors` 检索接口在 1a 后续实现（`sentence-transformers` 通过 `[vectors]` extra 安装）。

- 启用 `vector` 扩展（`db/init/000_extensions.sql`）。
- 文献/RAG 文本块的嵌入在**服务端**计算并存入 `vector` 列。
- 相似检索用 pgvector 距离算子；Top-K 返回后由后端组装。

> 旧实现为浏览器端 Transformers.js（`Xenova/all-MiniLM-L6-v2`，384 维），随 `lib/local/*` 删除。

---

## 6. 审计与同意

- **同意**：创建 Agent 运行要求存在与项目/用户匹配、`redaction_confirmed=true` 的 `ai_consents_v2`，且 `external_services` 含 `crossref`，否则 `403 EXTERNAL_AI_CONSENT_REQUIRED`。
- **审计**：SHA-256 哈希链（`entry[N].parentHash == entry[N-1].outputHash`）；Stage 1 起落在后端审计表，客户端不再持有账本。

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

---

## 附录：旧数据层（迁移中）

重构前，iScholar 使用两层浏览器/远端存储，仍存在于 `lib/local/*` 与 `lib/supabase/*`，按 Stage 逐步删除。

### A1. IndexedDB（Dexie）

- 库名 `ischolar-v6-local`，Dexie schema **v4**。
- 科研表：`projects`、`manuscripts`、`manuscriptBlocks`、`bibItems`、`attachments`、`ragChunks`、`experiments`、`submissions`、`reviewRounds`、`rebuttalItems`、`agentRuns`、`manuscriptVersions`、`auditLedger`、`tasks`。
- 训练表：`trainingPrograms`、`enrollments`、`trainingTasks`、`trainingSubmissions`、`evidenceCards`、`trainingReviews`、`aiConsents`。
- 插件表：`pluginInstalls`、`promptPackSelections`（本地专用，不协作同步）。
- 变更规则：**必须新增 `this.version(N)`**，不可就地改旧版本；同步更新导出格式与 `__tests__/lib/local/export-compatibility.test.ts`。

### A2. Supabase 协作层

- Supabase Auth + PostgreSQL + RLS；迁移位于 `supabase/migrations/`（`202607160001` … `202607180011`），含训练营生命周期、任务编排、助教 RLS、同意审计、任务包/证书、同伴互评、多租户、LMS。
- 角色：全局 `profiles.role`（learner/librarian/admin）、院系 `organization_members`、营内 `training_enrollments.role`（learner/ta）。
- camelCase ↔ snake_case 映射唯一真相源为 `lib/supabase/field-map.ts`（`DEXIE_TO_REMOTE_TABLE` / `REMOTE_COLUMN_MAP`，注意 `order` → `ordinal`）。

**新增需同步远端的字段（旧流程）**：

1. 写 SQL migration（`supabase/migrations/`）
2. 更新 `REMOTE_COLUMN_MAP` / `DEXIE_TO_REMOTE_TABLE`
3. 更新本文件与 `doc/database.md`
4. 补回归测试 `__tests__/lib/supabase/field-map.test.ts`；跑 `pnpm lint:supabase-schema`

> 该流程仅适用于尚未迁移的遗留字段；目标平台不再使用 Supabase。
