# 手机 App 配套后端接口（2026-10-25）

本批次先同步后端源码，不部署服务器、不发布新安装包，也不提前改变线上强制更新策略。
测试覆盖 Android 0.4.8 使用的 Bearer 会话、`X-Client: mobile`、`X-App-Version: 0.4.8`。
0.4.8 测试包可以访问这版接口；公开安装包版本信息暂保留现有发布策略，正式发布 APK 时再一起更新。

## 相比已上传代码新增的主要接口

所有路径均以 `/api` 开头。除标注公开的接口外，必须携带当前用户 Bearer 会话；管理接口还需管理员权限。

| 功能 | 方法和路径 | 用途 |
| --- | --- | --- |
| 积分钱包 | `GET /account/points/wallet` | 当前可用、冻结、待发放积分及账本版本 |
| AI 费用 | `GET /account/points/services` | 服务预估、配置的模型和可用状态 |
| 积分概览 | `GET /account/points` | 钱包、套餐及计费规则 |
| 积分流水 | `GET /account/points/transactions` | 分页账本明细 |
| AI 使用记录 | `GET /account/points/operations` | 任务和模型调用记录，支持分页 |
| 单次扣费回执 | `GET /account/points/receipt?requestId=UUID` 或 `?jobId=UUID` | 扣费、退款、冻结释放；两种参数不能混用 |
| 邮箱功能状态（公开） | `GET /auth/security-config` | 是否开启邮箱验证、邮件服务是否可用 |
| 验证码（公开） | `POST /auth/email-code` | 注册、找回及绑定流程，内置频率限制 |
| 找回密码（公开） | `POST /auth/reset-password` | 校验验证码并更新凭据 |
| 账号安全 | `GET /auth/security`、`POST /auth/bind-email`、`POST /auth/change-password` | 邮箱绑定、修改密码及会话失效 |
| 专项学习状态 | `GET /location-learning` | 当前账号、证书的学习进度和解锁状态 |
| 开始专项练习 | `POST /location-learning/start` | 按知识点创建练习 |
| 练习过程 | `POST /location-learning/:id/{present,pulse,pause,answer,advance,cancel}` | 服务端计时、答题、继续或取消 |
| 原生功能凭证 | `POST /location-learning/permit`、`POST /location-learning/consume` | 完成学习后签发并一次性消费凭证 |

管理端新增 `/admin/points/*`（用量、用户明细、费率、资金、发放、成本核对）和
`/admin/ai-services/*`（渠道增改、排序、启停、显式连接测试和管理策略）。
互动学习、知识点收藏、学习计划等运行依赖随同后端保留；既有头像、公告与手机版本接口不是本轮新创接口。

## 已有接口的增强

- `/account/entitlements` 增加 `billingMode: points`、`points` 和 `pointsPlans`。
- `/account/check-in` 和 `/account/redeem` 接入同一积分账本；签到重复提交不重复发放。
- 现有 AI 接口贯通任务预留、实际用量计费、缓存命中和失败退款。回执以服务端记录为准，不用前后余额相减推测。
- 账号隔离、证书隔离和学习统计保持原有链路。

## 本地验证

使用 Node.js 24，安装依赖后运行：

```sh
npm ci
npm run verify:backend
```

验证脚本使用随机测试密钥和临时数据库，屏蔽非本机 HTTP 请求；不会调用真实模型、操作线上账号或使用真实资金。
专项接口测试不能替代完整 Web、APK 发布和手机实机验收。

## 服务器更新时的必要事项（本次未部署）

1. 先备份现有 `.env` 和整个 `DATA_DIR`，保留原 `AI_MASTER_KEY`；更换它会使旧 API Key 无法解密。
2. 安装当前代码依赖，保持既有数据目录，不删库、不用测试数据覆盖用户数据。
3. 积分专用迁移可运行 `npm run points:migrate -- --data-dir <现有数据目录> --backup-dir <备份目录>`；它先备份，只补积分表并校验原表不变。
4. 在既有 AI 渠道上确认模型、有效费率和资金记录。积分表存在不等于已经有可花余额；资金不足时会员积分可处于待发放状态。
5. 邮箱验证默认关闭；需要启用时先配置并检查 SMTP，保留原环境配置，不上传邮件密码或 API Key。
6. 重启现有服务后，用真实登录会话核验钱包、套餐、签到及 AI 回执。匿名返回 401 不能证明目标路由存在。

## 完整新增路由清单

对照 GitHub 基线 `64ad007` 实例化后端，按“HTTP 方法 + 路径”去重：108 → 205，新增 97，移除 0。
这包括配套管理和学习依赖，不代表每个页面都是本轮新增。

```text
DELETE /api/admin/ai-services/channels/:id
DELETE /api/admin/console/config/key
GET /api/account/points
GET /api/account/points/operations
GET /api/account/points/receipt
GET /api/account/points/services
GET /api/account/points/transactions
GET /api/account/points/wallet
GET /api/admin/ai-services
GET /api/admin/console/announcement
GET /api/admin/console/audit
GET /api/admin/console/catalog
GET /api/admin/console/config
GET /api/admin/console/documents
GET /api/admin/console/documents/:id
GET /api/admin/console/feedback
GET /api/admin/console/jobs
GET /api/admin/console/jobs/:id
GET /api/admin/console/overview
GET /api/admin/console/questions
GET /api/admin/console/questions/:id
GET /api/admin/console/system
GET /api/admin/console/teaching
GET /api/admin/console/teaching/:id
GET /api/admin/console/usage
GET /api/admin/console/users
GET /api/admin/console/users/:id
GET /api/admin/points/configuration
GET /api/admin/points/usage
GET /api/admin/points/users/:id
GET /api/auth/security
GET /api/auth/security-config
GET /api/knowledge-favorites
GET /api/knowledge-favorites/:id
GET /api/knowledge-favorites/catalog
GET /api/knowledge-favorites/info
GET /api/learning-plan
GET /api/location-learning
GET /api/tutor/v1/catalog
GET /api/tutor/v1/questions/:id
GET /api/tutor/v1/sessions/:id
GET /api/tutor/v1/sessions/:id/concepts/:concept
GET /api/tutor/v1/sessions/:id/teacher
GET /api/tutor/v1/sessions/current
GET /api/tutor/v1/usage
GET /api/web-preferences
POST /api/admin/ai-services/channels
POST /api/admin/ai-services/channels/:id/state
POST /api/admin/ai-services/channels/:id/test
POST /api/admin/ai-services/import-legacy
POST /api/admin/ai-services/order
POST /api/admin/ai-services/policy
POST /api/admin/console/config/test
POST /api/admin/console/documents
POST /api/admin/console/documents/:id/check
POST /api/admin/console/documents/:id/export
POST /api/admin/console/generation
POST /api/admin/console/jobs/:id/cancel
POST /api/admin/console/jobs/:id/retry
POST /api/admin/console/quality/scan
POST /api/admin/console/questions/:id/draft
POST /api/admin/console/questions/export
POST /api/admin/console/visibility
POST /api/admin/console/visibility/preview
POST /api/admin/points/calls/:id/reconcile
POST /api/admin/points/finance
POST /api/admin/points/grants
POST /api/admin/points/rates
POST /api/auth/bind-email
POST /api/auth/change-password
POST /api/auth/email-code
POST /api/auth/reset-password
POST /api/learning-plan
POST /api/learning-plan/:id/tasks/:task/session
POST /api/learning-plan/tasks
POST /api/location-learning/:id/advance
POST /api/location-learning/:id/answer
POST /api/location-learning/:id/cancel
POST /api/location-learning/:id/pause
POST /api/location-learning/:id/present
POST /api/location-learning/:id/pulse
POST /api/location-learning/consume
POST /api/location-learning/permit
POST /api/location-learning/start
POST /api/study-reminders/check
POST /api/tutor/v1/sessions
POST /api/tutor/v1/sessions/:id/actions
POST /api/tutor/v1/sessions/:id/teacher
PUT /api/admin/ai-services/channels/:id
PUT /api/admin/console/announcement
PUT /api/admin/console/config
PUT /api/admin/console/documents/:id
PUT /api/admin/console/feedback
PUT /api/admin/console/users/:id
PUT /api/knowledge-favorites/:id
PUT /api/learning-plan/:id/tasks/:task
PUT /api/web-preferences
```
