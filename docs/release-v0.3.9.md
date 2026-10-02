# v0.3.9 考试同步与服务可靠性更新

本版改善考试答案保存、AI 任务调度、登录保护与网页加载，不修改题干、选项、答案或题目来源。

## App 更新

- 模拟考试保存和交卷带上答案版本，避免覆盖其他设备已经同步的作答。
- 发生冲突时可选择使用已同步答案，或合并本机尚未同步的作答后继续保存。Android 与 iPhone / iPad 移动网页共用这一改动。
- 配套后端允许不同账号同时使用 AI，限制总并发、排队时间、任务时长与补生成轮数；失败按原有额度规则返还。
- 登录注册增加频率保护和等待提示，密码计算改为异步；微信绑定凭证的消费与账号创建在同一事务中完成。

## 电脑网页与验证

- 考试显示保存状态，保留按账号与证书隔离的本机待保存答案，支持重试、联网同步和从未完成记录恢复。
- 练习、考试、社区、VIP 和管理等页面按需加载，提供加载中与失败重试提示。
- `npm run verify` 统一执行题库结构、移动端类型、95 项单元与接口测试、两套网页构建、电脑流程与移动网页 Chromium / WebKit 流程检查。GitHub 工作流自动执行相同检查。
- AI 与登录限制的默认值、兼容行为见[可靠性优化说明](reliability-improvements.md)。

## 发布附件

从 [v0.3.9 发布页](https://github.com/florianferizaj2-byte/netwise-practice/releases/tag/v0.3.9) 下载：

- `kaojiang-v0.3.9.apk`：正式签名的 Android 安装包。
- `kaojiang-server-v0.3.9-afd85f0df9cfab80.tgz`：已编译的电脑网页、移动网页、后端、内置题库、题目图片与当前 APK，不需要在服务器构建网页。
- 对应 `.sha256`：核对下载完整性；`.tgz.files.txt`：运行时文件清单。
- `release-v0.3.9.md`：本说明。源码由发布标签和仓库分支提供。

更新包不含 `.env`、数据库、用户上传、AI 密钥、签名证书、依赖目录或原生构建目录。`release-manifest.json` 记录版本、源码提交、移动网页 buildId 与 APK 校验值。

## Android 安装包

- 包名：`com.kaojiang.app`；versionName：`0.3.9`；versionCode：`23`。
- 沿用正式证书，相同正式签名的 v0.3.3 至 v0.3.8 可覆盖更新。
- 正式证书 SHA-256：`986e4d8a00ce694362b2ac7883588e2775d3259201900c92b88978e797957a3b`。
- 大小：73,545,922 字节；最低 Android SDK 24，目标 SDK 36；包含 arm64-v8a、armeabi-v7a、x86 和 x86_64。
- APK SHA-256：`ff8d3000a79f0e26e169735f6ef086baed38bfb720ceb7465f5b5a829643734e`。校验文件为 `kaojiang-v0.3.9.apk.sha256`；源码中相同安装包位于 `public/downloads/` 和 `mobile/`。
- Android Release 构建通过；签名、包名、版本、SDK、架构与生产 API 地址已核对。

## 服务器更新

生产服务器由站点维护者部署。先停止现有 Node 服务，并备份当前程序、原 `.env`、`DATA_DIR`（包含 SQLite 的 `-wal`、`-shm` 文件）和用户上传。将更新包合并解压到现有项目目录，保留这些私有数据；然后在项目根目录运行 `npm ci --omit=dev`，按原流程重启 Node 服务。运行环境沿用 Node 24。

宝塔可直接上传并解压 `.tgz`，其中完整 `dist/` 已含 `dist/app/` 和新版下载入口。仅替换源码时，仍需安装根目录与 `mobile/` 依赖并运行 `npm run build`。需要重新制作运行时更新包时，在源码已提交、APK 校验与网页构建一致的情况下运行 `npm run package:release`。

如果服务器使用 Git 拉取源码：

```sh
git pull --ff-only origin main
npm ci --include=dev
npm ci --prefix mobile --include=dev
npm run build
```

服务器已有移动版环境配置时，更新以下三项；其他配置保持原值：

```dotenv
MOBILE_LATEST_VERSION=0.3.9
MOBILE_DOWNLOAD_URL=/downloads/kaojiang-v0.3.9.apk
MOBILE_RELEASE_NOTES=优化考试答案保存和跨设备冲突处理，改进 AI 并发、任务超时及登录保护。
```

最低支持版本保持 v0.2.8。进程环境变量优先于 `.env`，修改后需重启。新增限流表会自动创建，已有考试答案从版本 0 开始；旧客户端接口仍保持兼容。作者 AI 服务继续使用服务器原有私有配置。

## 部署后确认

- `/api/mobile/version?version=0.3.8` 返回 `latestVersion: 0.3.9` 和新版下载地址；APK 校验值与发布附件一致。
- 首页、登录弹窗和账号菜单的 Android 下载均指向 v0.3.9；苹果移动网页刷新到最新构建。
- 两端打开同一考试，同时保存时出现版本冲突提示，选择合并或已同步答案后能继续考试并交卷。
- 不同账号可并发使用 AI，失败返还对应账号额度；登录触发频率限制时有明确等待提示。

上传 GitHub 不会自动更新生产服务器。浏览器回归使用隔离账号、数据库与 AI 测试桩；生产 AI 连通性和 Android / iPhone 真机安装、交互需在部署后确认。

## 本地验证结果

`npm run verify` 全部通过：95 项测试通过、0 项失败，移动端类型检查与两套网页构建通过。电脑端及移动网页 WebKit / Chromium 流程验证了考试保存、刷新恢复、跨设备冲突合并、交卷及主要学习功能。

移动网页 buildId 为 `afd85f0df9cfab80`。电脑网页主脚本为 335.10 kB（gzip 108.00 kB），学习页面分开加载。题库结构检查通过，题目内容保持原样。
