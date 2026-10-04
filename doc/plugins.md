# 插件系统

> 插件数据存储在 **PostgreSQL、按用户归属**；插件通过 BFF（`/api/plugins` → `/v1/plugins`）读写，可跨设备使用。

iScholar 支持**基于清单（manifest）的插件**，包含三类能力：

1. **自定义 Agent** — 通用表单 UI + 系统/用户提示词模板
2. **提示词包（Prompt Pack）** — 覆盖内置或插件 Agent 的系统提示词
3. **声明式 MCP 工具** — HTTPS 工具 + JSON Schema 参数（后端按**用户**注册与执行，见 `app/mcp/plugin_tools.py`；不使用进程级全局注册表，也不经共享 MCP 服务端暴露）

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

- 仅 `https`；私有/链路本地/元数据主机被拦截；`GET`/`POST`；重定向关闭、响应上限 2 MiB。
- `Authorization` / `Cookie` / `Host` / `x-api-key` 等敏感头被清单剥离（凭据仅服务端持有）。
- 工具**按 `owner_id` 解析**（`load_user_tools`），不会进入全局注册表，也**不会**经共享 MCP 服务端暴露；不能覆盖内置工具名。
- 后端运行路径（`AgentHarness.call_tool`）与 `/v1/mcp` REST 均需同意证明。
- 参数按 JSON-Schema 子集校验（必填 + 封闭键集）。

参见 `fixtures/plugins/open-library-tools.json`。

---

## 安全约束

- **不执行远程代码**——插件只承载声明式数据。
- Agent 运行与外部工具抓取仍需 AI 同意证明（产品策略）。
- Manifest ≤ 256KB；系统提示词 ≤ 30k 字符。
- 声明式工具的 URL 经 SSRF 守卫（仅 HTTPS、禁私有网段、体量上限 2 MiB）。
- 插件按 `owner_id` 隔离；插件 Agent 的运行同样经 `AgentHarness` 与 authorization 校验。

---

## 实现与开发者地图

| 模块 | 职责 |
| --- | --- |
| `lib/plugins/*` | manifest schema、注册表、安装、提示词解析、客户端校验 |
| `lib/client/plugins.ts` + `app/api/plugins/[...path]` | 客户端与 BFF 代理 |
| 后端 `plugin_installs` / `prompt_pack_selections` + `/v1/plugins` | 按用户存储安装与提示词包选择 |
| 后端 `app/mcp/plugin_tools.py` | 解析/校验/执行声明式工具；`load_user_tools` 按 owner 解析 |
| `app/agents/harness.py` + `app/agents/runtime.py` | `p.<plugin>.<key>` 运行时注入 owner 工具（allow-list + 预算 + 事件） |
| `app/api/v1/mcp.py` | `/v1/mcp/tools` 列出内置 + 本人插件工具；调用受同意门约束 |
| 后端 `app/agents/graphs/plugin.py` | 插件 Agent 运行（复用内置运行时） |
| `components/plugins/*` | 设置页 + 通用 Agent UI |

内置 Agent 保持静态路由与专属 UI。
