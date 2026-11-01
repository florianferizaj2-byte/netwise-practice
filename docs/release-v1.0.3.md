# 考匠 v1.0.3

[下载 APK](https://github.com/florianferizaj2-byte/netwise-practice/releases/download/v1.0.3/kaojiang-v1.0.3.apk) · [GitHub 发布页](https://github.com/florianferizaj2-byte/netwise-practice/releases/tag/v1.0.3)

Android 包名 `com.kaojiang.app`，versionName `1.0.3` / versionCode `36`；后端标识 `1.0.3`，API revision 保持 1。沿用原正式签名，最低 Android SDK 24、目标 SDK 36，包含四种 ABI。

## 更新内容

- 正余额可发起付费 AI，不再要求覆盖保守的整笔预扣。成功按真实 Token 用量结算，允许扣成负数；余额为零或负数时禁止新的付费调用。
- 后续签到及补充积分先抵扣欠分；失败退款、免费题库解析、已有缓存和请求幂等保留。同账号不能叠加并发透支。
- 普通练习可提前取得答案与解析，确认后立即反馈；服务器继续判分，后台保存作答。待同步记录按账号、证书和服务地址隔离，支持重启续传和相同请求编号重试，避免重复记题。考试接口不提前下发答案。
- 积分余额与记录、每日签到、关于考匠和紧凑错题页按已选设计实现；支持小屏、大字号和深色主题。字体完整许可仍可查看，原赞助入口保留。
- 成本测算明确区分已发积分成本参考与未收回欠分风险，欠分不计作现金收入。费率和实际用量核算方式不变。

## 安装与文件完整性

- APK：`kaojiang-v1.0.3.apk`，100444692 字节。
- SHA-256：`a7a2b633fa2b80e788da4b5c21b1ef65dfacaf6f5eb23aecfa240a001ace9339`。
- 正式签名与 v1.0.1 / v1.0.2 一致；仅签名/包校验并不等于手机覆盖安装已验收。
- 最低支持客户端仍为 `1.0.1`，本次不额外强制 1.0.1 / 1.0.2 更新。

## 配套后端部署

本次 APK 与后端需要一起更新才能使用新的扣分规则。源码在当前发布标签及 `codex/v1.0.1-blue-web-backend` 分支。推送不会替你部署服务器。

1. 保留原 `.env`、`DATA_DIR`、用户数据库和上传文件，先备份并停止旧服务。
2. 使用 Node.js 24 或以上，取得本标签对应源码，或更新上述发布分支；不要清理用户数据。
3. 安装构建依赖：`npm ci --include=dev`。
4. 用原数据库目录的**实际绝对路径**执行迁移（不是新建空目录）：`node scripts/migrate-ai-points.mjs --data-dir <实际DATA_DIR>`。脚本先备份，再检查原表未变与账本一致性。
5. 执行 `npm run build`，再按原有方式启动/重启服务。该构建目标为 Android，不覆盖既有手机网页 `/app/`。
6. 部署后核对 `/api/mobile/version?version=1.0.3` 的 `backend.version` 与 `latestVersion` 均为 `1.0.3`，并核对 APK 下载字节数和校验值。

## 验收边界

本地检查使用隔离数据库、合成上游用量，不消耗真实模型额度。手机实装、线上部署和真实供应商账单需要分别验证；不把 GitHub 上传当作已经线上生效。
