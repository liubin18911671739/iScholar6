# 插件系统

> 目标架构中，插件数据存储在 **PostgreSQL、按用户归属**（`IMPLEMENTATION_PLAN.md` Stage 6）；插件通过 BFF 经后端读写，可跨设备使用。
>
> ⚠️ 重构进行中：当前实现为浏览器本地存储（IndexedDB），见文末[附录](#附录本地实现迁移中)。

iScholar 支持**基于清单（manifest）的插件**，包含三类能力：

1. **自定义 Agent** — 通用表单 UI + 系统/用户提示词模板
2. **提示词包（Prompt Pack）** — 覆盖内置或插件 Agent 的系统提示词
3. **声明式 MCP 工具** — HTTPS 工具 + JSON Schema 参数

---

## 快速开始

1. 打开 **设置 → 插件系统 / Plugin System**。
2. 粘贴 JSON manifest（或上传 `fixtures/plugins/` 中的文件）。
3. 点击 **Install**。
4. 提示词包：在每个内置 Agent 下选择激活的包。
5. 自定义 Agent：打开 `/projects/{projectId}/p.{pluginId}.{agentKey}`（示例：`/projects/abc/p.ethics-kit.irb-assist`）。

---

## 清单结构

```json
{
  "schemaVersion": 1,
  "id": "my-plugin",
  "version": "1.0.0",
  "name": "My Plugin",
  "description": "optional",
  "agents": [],
  "promptPacks": [],
  "mcpTools": []
}
```

`agents`、`promptPacks`、`mcpTools` 至少其一非空。

### 自定义 Agent

- 完整 id 形如 `p.<pluginId>.<key>`（不可覆盖内置 `topic`…`rebuttal`，也不可与插件 Agent 冲突）。
- `userPromptTemplate` 支持 `{{fieldName}}` 占位符。
- `inputFields` 类型：`text` | `textarea` | `number` | `select`。

参见 `fixtures/plugins/ethics-kit.json`。

### 提示词包

- `overrides.<agentId>.systemPrompt` 和/或 `userPromptTemplate`。
- 选择是**全局**的（按用户），而非按项目。

参见 `fixtures/plugins/cs-hci-prompts.json`。

### 声明式 MCP 工具

- 仅 `https`；私有主机被拦截；不允许 `Authorization` / API-key 头。
- 外部工具调用需要同意证明（`consentProof`，含 `consentId`）。
- 内置工具（`openalex_search` 等）由后端 MCP 层执行。

参见 `fixtures/plugins/open-library-tools.json`。

---

## 安全约束

- **不执行远程代码**——插件只承载声明式数据。
- Agent 运行与外部工具抓取仍需 AI 同意证明（产品策略）。
- Manifest ≤ 256KB；系统提示词 ≤ 30k 字符。
- 声明式工具的 URL 经 SSRF 守卫（仅 HTTPS、禁私有网段、体量上限 2 MiB）。
- 插件按 `owner_id` 隔离；插件 Agent 的运行同样经 `AgentHarness` 与 authorization 校验。

---

## 目标实现与开发者地图

| 模块 | 职责 |
| --- | --- |
| `lib/plugins/*` | manifest schema、注册表、安装、提示词解析、SSRF 安全 HTTP |
| 后端 `plugins` 表 + `/v1/data/plugins/*` | 按用户存储安装与提示词包选择（Stage 6） |
| 后端 `agents` 图/harness | 插件 Agent 运行（复用内置运行时） |
| `app/.../projects/[projectId]/[agentId]/page.tsx` | 动态插件 Agent 路由 |
| `components/plugins/*` | 设置页 + 通用 Agent UI |

内置 Agent 保持静态路由与专属 UI。

---

## 附录：本地实现（迁移中）

当前插件数据存在浏览器 IndexedDB（Dexie schema v4 的 `pluginInstalls`、`promptPackSelections`），**不参与协作同步**。可通过环境变量 `NEXT_PUBLIC_PLUGIN_SYSTEM=false` 关闭。

迁移到 target 后：

- `pluginInstalls` / `promptPackSelections` 迁入 Postgres，按 `owner_id` 归属。
- 自定义 Agent 的运行改由后端 LangGraph 图执行。
- 声明式 MCP 工具改由后端 MCP 客户端池执行（保留 SSRF / 体量守卫）。
