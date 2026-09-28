# v0.3.8 作者统一 AI 服务

本版把此前仅保存在本地的作者统一 AI 服务正式纳入发布源码。普通账号的解析、提示、错因分析、学习计划和出题使用站点作者的服务连接；各账号的学习记录、生成题组及额度分别保存。原有个人密钥不再用于这些学习请求。

## 更新内容

- 只有主管理员可以管理作者 AI 服务配置；普通用户在 VIP 和设置页查看服务状态与自己的额度，无需配置个人 API。
- 解析、提示、分析按请求扣对应额度；出题先扣签到机会，再按题数扣会员额度。余额不足时不会调用上游，失败返还；打开已有题组或已保存学习计划不扣额。
- 学习计划由用户主动请求，后台不会自动消耗额度。移动网页同步修复部分屏幕底栏下方的留白。
- 保留 v0.3.7 的题库内存缓存与首页 30 秒结果缓存。

## 安装包

- Android：`public/downloads/kaojiang-v0.3.8.apk`，另有相同内容的 `mobile/kaojiang-v0.3.8.apk`。
- 包名：`com.kaojiang.app`；versionName：`0.3.8`；versionCode：`22`。
- 沿用正式签名，可覆盖安装正式签名的 v0.3.3 至 v0.3.7；旧 Debug 签名版需要先卸载。
- 大小：73,543,770 字节；最低 Android SDK 24，目标 SDK 36。
- 正式签名证书 SHA-256：`986e4d8a00ce694362b2ac7883588e2775d3259201900c92b88978e797957a3b`。
- APK SHA-256：`8951d38a8563d5d09310bc65d7325b92f1973dc6465401afc49cb94283358967`；校验文件：`public/downloads/kaojiang-v0.3.8.apk.sha256`。

## 服务器部署

生产服务器由站点维护者部署。先停止现有 Node 服务，并备份原 `.env`、`DATA_DIR`（包括 SQLite 的 `-wal`、`-shm` 文件）、用户上传文件和当前程序。更新时保留这些私有数据，不用仓库中的示例配置覆盖它们。

使用 Git 管理的服务器在项目根目录执行：

```sh
git pull --ff-only origin main
npm ci --include=dev
npm ci --prefix mobile --include=dev
npm run build
```

然后按原流程重启 Node 服务。用宝塔上传时，同步新版 `server/`、`mobile/`、`public/`、`docs/`、`scripts/`、依赖清单和完整 `dist/`（包括 `dist/app/`）；不上传本机数据库、`.env`、依赖目录或原生构建目录。

服务器需要设置可用的作者 AI 配置。推荐仅在服务器私有环境中设置 `AI_SERVICE_API_KEY`，如使用其他兼容接口，再一起设置 `AI_SERVICE_BASE_URL` 和 `AI_SERVICE_MODEL`。已有主管理员在服务器保存的 AI 配置也可作为来源；选择顺序与旧配置兼容规则见[作者 AI 服务说明](author-ai-service.md)。不要把真实密钥写入仓库、移动网页或 APK。

若服务器已有移动版环境配置，更新以下三项，其他配置保持原值：

```dotenv
MOBILE_LATEST_VERSION=0.3.8
MOBILE_DOWNLOAD_URL=/downloads/kaojiang-v0.3.8.apk
MOBILE_RELEASE_NOTES=所有账号统一使用作者 AI 服务，按账号额度扣除解析、分析和出题次数；优化移动页面适配。
```

最低支持版本仍为 v0.2.8。服务器进程环境变量优先于 `.env`，修改后需重启。

## 部署后确认

- `/api/mobile/version?version=0.3.7` 返回 `latestVersion: 0.3.8` 和新版下载地址；下载的 APK 哈希与仓库校验文件相同。
- 普通账号可签到并调用 AI 解析；扣除的是该账号的额度，另一账号的额度不变。余额不足时收到明确提示。
- AI 调用失败后额度返还；再次打开已保存的学习计划或已有题组不重复扣除。
- 普通账号无法修改作者密钥；主管理员可查看服务状态和维护配置，真实密钥不出现在普通账号响应中。
- Android 正式签名旧版可覆盖安装 v0.3.8；iPhone / iPad 刷新 `/app/` 后底栏和安全区正常。

## 本地验证范围

`npm run build` 已生成电脑网页和移动网页；移动网页 buildId 为 `216414eb0c668f52`。WebKit / Chromium 端到端流程、移动端 TypeScript 检查以及 Android `assembleRelease` 构建通过；`apksigner` 和 `aapt` 已核对正式签名、包名、版本、SDK 与架构。

自动测试共 67 项，66 项通过；剩下 1 项知识点分类测试依赖仓库尚未提交的 `server/question-banks/network-engineer/reports/taxonomy-review-20260926.json`，属于既有测试资料缺失。旧电脑端演示脚本仍基于早期免登录流程，本次未将它计为通过。生产部署、真实作者密钥连通性和 Android / iPhone 真机验收仍需分别确认。
