# 部署指南

> iScholar v6.0 的**目标部署形态是「全 Docker」**：`web` + `backend` + `worker` + `postgres(pgvector)` + `redis` + `proxy(Caddy)`，数据存储在自有 PostgreSQL。
>
> ⚠️ 重构进行中；旧独立容器 / Vercel 部署方式见文末[附录](#附录旧部署方式迁移中)。

---

## 一、Compose 拓扑

`docker-compose.yml`（项目名 `ischolar`）包含：

| 服务 | 镜像 / 构建 | 作用 | 关键点 |
| --- | --- | --- | --- |
| `postgres` | `pgvector/pgvector:pg16` | 领域库 + auth 表 + 向量 | 挂载 `./db/init`（首次初始化执行扩展 + auth 表） |
| `redis` | `redis:7-alpine` | 限流 / pub-sub | `--appendonly yes` |
| `migrate` | `./services/backend` | `alembic upgrade head` | 一次性，backend/worker 依赖其**成功完成** |
| `backend` | `./services/backend` | FastAPI `/v1/*` | healthcheck 打 `/v1/healthz` |
| `worker` | `./services/backend` | `python -m app.worker` | 后台运行消费 |
| `web` | `docker/web.Dockerfile` | Next.js standalone + Auth.js | 依赖 postgres/backend/worker 健康 |
| `proxy` | `caddy:2-alpine` | 80/443 + TLS + SSE 反缓冲 | 挂载 `./proxy/Caddyfile` |
| `eval` | `./services/eval` | 评估 harness | `profiles: ["eval"]`，默认不启 |

```bash
cp .env.example .env          # 填必填值
docker compose config         # 修改 compose 前必须校验
pnpm docker:up                # docker compose up -d --build
pnpm docker:down
```

> ⚠️ `.env` 中若留默认值（`dev-insecure-change-me`），仅可用于本地；生产必须替换。

---

## 二、环境变量

完整列表见 [`.env.example`](../.env.example)。

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | 后端 asyncpg 连接串，如 `postgresql+asyncpg://ischolar:ischolar@postgres:5432/ischolar` |
| `AUTH_DATABASE_URL` | ✅ | Auth.js 适配器 libpq 连接串（仅 auth 表），如 `postgresql://…` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | ✅ | Postgres 初始化 |
| `REDIS_URL` | ✅ | 默认 `redis://redis:6379/0` |
| `AUTH_SECRET` | ✅ | Auth.js 密钥，`openssl rand -base64 32` |
| `AUTH_URL` / `AUTH_TRUST_HOST` | ✅ | 生产填真实域名，`AUTH_TRUST_HOST=true` |
| `AGENT_SERVICE_TOKEN` | ✅ | web↔backend 身份签名共享密钥，**仅服务端** |
| `BACKEND_INTERNAL_URL` | ✅ | web 访问后端的私有地址，默认 `http://backend:8000` |
| `BACKEND_PORT` / `WEB_PORT` | ⚪ | 宿主机端口映射 |
| `DEEPSEEK_API_KEY` | ✅ | 仅服务端 |
| `DEEPSEEK_API_URL` / `DEEPSEEK_MODEL` | ⚪ | 默认 `https://api.deepseek.com` / `deepseek-v4-flash` |
| `NEXT_PUBLIC_APP_URL` | ⚪ | 前端展示用地址 |

**安全红线**：

- `AGENT_SERVICE_TOKEN`、`BACKEND_INTERNAL_URL`、`DEEPSEEK_API_KEY`、`AUTH_SECRET`、`DATABASE_URL` / `AUTH_DATABASE_URL` **绝不能**加 `NEXT_PUBLIC_` 前缀，也不得进入浏览器 bundle。
- 身份在服务间**签名**传递；后端拒绝未签名或 ±300s 之外的请求（`services/backend/app/core/security.py`）。
- `.env` 已被 git 忽略，切勿提交或写入镜像层。

---

## 三、数据库迁移

领域 schema **只**由 Alembic 管理：

```bash
# compose 会自动执行，也可手动：
docker compose run --rm migrate alembic upgrade head

# 新增迁移
docker compose run --rm backend alembic revision -m "add training tables"
```

- 迁移位于 `services/backend/alembic/versions/`；**不要修改已应用的版本**，只新增 revision。
- auth 表由 `db/init/001_auth.sql` 在**数据卷首次初始化**时创建；已有数据卷不会重跑 init。若需重建：`docker compose down -v`（会删除数据，谨慎）。
- 每次新增/修改迁移后，同步更新 [`doc/database.md`](./database.md)。

---

## 四、反向代理 / HTTPS（Caddy）

`proxy/Caddyfile` 由 Caddy 提供 HTTPS 并反代 `web`。SSE（`/api/agent/.../events`）必须关闭缓冲——Caddy 的 `reverse_proxy` 默认即可，但要确保：

- 不启用会缓冲 SSE 的插件 / 中间层
- 超时足够长（长文智能体可能数分钟）

若改用 Nginx，参考：

```nginx
location /api/agent/ {
    proxy_pass http://web:3000;
    proxy_http_version 1.1;
    proxy_buffering off;          # 关键：SSE 实时推送
    proxy_read_timeout 300s;
}
location / {
    proxy_pass http://web:3000;
    proxy_http_version 1.1;
}
```

---

## 五、Node 版本

**推荐 Node ≥ 22**（`docker/web.Dockerfile` 使用 `node:22-alpine`）。Node 20 下模块页全量 SSR 可能因缺少 `Promise.withResolvers` 报错。

---

## 六、web 镜像构建

`docker/web.Dockerfile` 为多阶段构建：

1. **deps**：`corepack enable` + `pnpm install --frozen-lockfile`
2. **builder**：`pnpm build`（构建期注入 `AUTH_SECRET=build-time-placeholder`，Auth.js 静态分析需要）
3. **runner**：仅拷贝 `.next/standalone` + `.next/static` + `public`，以非 root 用户 `nextjs` 运行 `node server.js`

`next.config.mjs` 必须保持 `output: "standalone"`，否则 runner 阶段无产物。

---

## 七、数据与隐私

- 领域数据（项目、稿件、运行、产物、证据、训练数据）存储在**部署方自有的 PostgreSQL**，由 Python 后端持有。
- auth 凭据（邮箱、密码哈希）存储在 auth 表，由 web 容器访问。
- 外部请求仍会发出（DeepSeek 生成、Crossref/OpenAlex/Semantic Scholar 检索）；这些调用需要近期同意证明并记录 `consent_id`。
- 审计账本（SHA-256 哈希链）存储在数据库。
- 向量由 pgvector 存储；嵌入在服务端计算（Stage 1+）。

> 不要对外宣称「文本绝不离开设备」；部署方应明确告知用户外部服务调用。

---

## 八、上线前检查 / 冒烟测试

1. `docker compose config` 通过
2. `pnpm docker:up` 后所有服务健康（`docker compose ps`）
3. `GET /v1/healthz`、`GET /v1/readyz` 返回 200
4. 访问站点 → 登录（Auth.js）→ 进入仪表盘
5. 新建项目 → 进入「选题探索」模块：确认 8 步进度条与 3 列独立滚动布局
6. 运行一次智能体 → 验证 SSE 流式返回（需有效 `DEEPSEEK_API_KEY`），并在运行详情中看到事件与产物
7. 测试 `POST /v1/agent/runs/{id}/cancel` 与 `resume` 状态流转
8. 设置页导出备份 / 导入正常
9. 语言切换（中文 ↔ English）无异常

后端自检：

```bash
cd services/backend && ruff check && pytest
```

---

## 附录：旧部署方式（迁移中）

重构前，iScholar 为**单 Next.js 应用**：

- **Vercel（曾为推荐）**：`vercel.json` 配置 `/api/agents/*` 300s、`/api/mcp/*` 60s 超时。
- **单容器自托管**：`output: "standalone"` 的独立 `Dockerfile`，`pnpm start`；科研数据存浏览器 IndexedDB，协作功能可选接 Supabase（Auth + PostgreSQL + RLS）。
- 旧的 Supabase 发布步骤（执行 `supabase/migrations/*.sql`、配置 `NEXT_PUBLIC_SUPABASE_*` 与 `SUPABASE_SERVICE_ROLE_KEY`）已不再是目标；相关 code path 与文档正随 Stage 1/6 清理。

这些方式仅作迁移期参考，新部署应使用 `docker-compose.yml` 全栈拓扑。
