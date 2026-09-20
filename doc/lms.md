# LMS / LTI 对接说明

> 目标架构中，训练数据与 LMS 配置存储在 PostgreSQL（后端拥有）；API 经 BFF 代理到 Python 后端。训练数据迁移见 `IMPLEMENTATION_PLAN.md` Stage 1/6。

## 已支持

| 能力 | 入口 |
| --- | --- |
| 通用成绩册 CSV | `GET .../export?scope=gradebook` |
| Canvas / Moodle 导入 CSV | `GET .../lms/gradebook?format=canvas\|moodle` |
| AGS 形 JSON（手工/集成） | `GET .../lms/gradebook?as=ags` |
| 平台密钥 + AGS 推送 | manage「LMS / LTI AGS 对接」；`PUT .../lms/link`；`POST .../lms/push` |

## 迁移

目标：`services/backend/alembic/versions/` 中的 LMS 迁移（表 `training_lms_links`：每营一条配置）。`client_secret` / `private_key_pem` 仅服务端使用，API GET 脱敏。

> 迁移期旧实现位于 `supabase/migrations/202607180011_lms_platform_links.sql`，随 Stage 1 一并迁入后端。

## AGS 推送流程

1. 在 LMS 创建 Developer Key / External tool，拿到 `client_id`、secret 或私钥，以及 line item URL。  
2. 在 iScholar manage 选中训练营 → 填写 Token URL、Line Item URL、密钥 → 启用推送 → 保存。  
3. **测试获取 Token**（`dryRun: true`）确认 OAuth2 client_credentials 可用。  
4. **推送成绩**：将本营有分数学员的 overall（任务均分）POST 到 AGS `/scores`。

鉴权方式：

- `client_secret_post`（默认）
- `client_secret_basic`
- `private_key_jwt`（RS256 PEM）

## 未做（完整 LTI 1.3）

- 浏览器 LTI Resource Link 启动 / OIDC login  
- Deep linking / NRPS 花名册同步  
- 平台 JWKS 自动发现与密钥轮换 UI  

这些需按学校 Canvas/Moodle 实例单独配置回调 URL 与工具注册，建议单独立项。

## 安全

- 密钥不进入浏览器 bundle；不写进前端日志。  
- 仅 `can_manage_program` 的 staff 可读写配置与触发推送。  
- TA 不可见完整密钥与推送。  
