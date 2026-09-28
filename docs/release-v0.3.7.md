# v0.3.7 首页与题库性能更新

本版同步更新 Android、iPhone / iPad 移动网页和 Node 后端。服务端把题库保存在内存中，题目变更时重新读取；按证书复用普通题列表。同一账号与证书的首页结果可在 30 秒内复用，答题、收藏、错题移除等操作后立即失效。首页只请求显示所需的目录摘要，练习页可直接显示仍有效的本地题目缓存。

## 安装包

- Android：`public/downloads/kaojiang-v0.3.7.apk`，与 `mobile/kaojiang-v0.3.7.apk` 内容相同。
- 包名：`com.kaojiang.app`；versionName：`0.3.7`；versionCode：`21`。
- 沿用 v0.3.3 至 v0.3.6 的正式签名，可覆盖安装；旧 Debug 签名版需卸载后安装。
- 大小：73,543,402 字节（约 70.14 MiB）；最低 Android SDK 24，目标 SDK 36。
- 正式签名证书 SHA-256：`986e4d8a00ce694362b2ac7883588e2775d3259201900c92b88978e797957a3b`。
- APK SHA-256：`ecd8ae137901308de9a605e0217cc9ae120b7eabb707d2b12f40e5e314391981`；校验文件：`public/downloads/kaojiang-v0.3.7.apk.sha256`。

## 更新服务器

生产服务器由站点维护者部署。先停止现有 Node 项目，备份程序、`.env`、`DATA_DIR`（默认 `data/`，包括 SQLite、`-wal`、`-shm`）和用户上传文件；保留备份在私有位置。更新时保留服务器原有配置、数据库、上传文件和签名材料，不要用本地文件覆盖。

使用 Git 管理的服务器在项目根目录执行：

```sh
git pull --ff-only origin main
npm ci --include=dev
npm ci --prefix mobile --include=dev
npm run build
```

然后按原流程重启 Node 项目。通过宝塔上传时，同步 `server/`、`mobile/` 源码、`public/`、`docs/`、`scripts/`、依赖清单以及完整 `dist/`；不上传本机数据库、`.env`、依赖目录和原生构建目录。`dist/app/` 必须与电脑网页一起发布。

若服务器已有版本环境配置，更新以下三项，其他配置保持原值：

```dotenv
MOBILE_LATEST_VERSION=0.3.7
MOBILE_DOWNLOAD_URL=/downloads/kaojiang-v0.3.7.apk
MOBILE_RELEASE_NOTES=题库常驻内存，首页结果 30 秒内复用；缩短题目列表、错题汇总和首页加载时间。
```

最低支持版本仍为 v0.2.8。服务器进程环境变量优先于 `.env`，修改后需重启。

## 部署后确认

- `/api/mobile/version?version=0.3.6` 返回 `latestVersion: 0.3.7` 和新版下载地址。
- `/downloads/kaojiang-v0.3.7.apk` 能下载，文件哈希与仓库校验文件一致。
- Android v0.3.6 可覆盖安装 v0.3.7，登录后首页、练习目录、错题、答题与进度正常。
- iPhone / iPad 打开 `/app/` 或手动刷新后使用 v0.3.7；切换首页和练习、断网重开已缓存页面均可正常显示。
- 修改或导入题目、完成答题后，题量与学习进度及时更新，没有跨账号或跨证书数据。

## 本地验证范围

9,650 道题和 60 条模拟错答的本机对照测试中，题库全量读取约 54–57 毫秒降到小于 0.01 毫秒，错题汇总约 1.0–1.4 秒降到 0.7–1.0 毫秒；首页结果 30 秒内缓存命中时，回环接口耗时约减少 68%。这些数据不等于真机启动或生产网络延迟。生产部署与真机验收需按上方项目单独确认。

Android `assembleRelease` 构建成功，`apksigner` 与 `aapt` 核对了签名、包名、版本、SDK 和架构；`npm run build` 生成电脑网页及移动网页，移动网页 buildId 为 `ea9d21f70a2e321e`。性能缓存专项测试与移动端 TypeScript 检查通过。完整测试集存在 3 项旧 AI 用例失败，另有 1 项分类测试依赖本仓库尚未提交的报告文件；本次更新未包含 AI 服务规则或分类报告。真机安装与线上部署待单独确认。
