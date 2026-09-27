# v0.3.6 题库目录修复与服务器更新

本版修复 App 普通题库混入个人 AI 题造成的旧分类和题数偏差，统一目录、顺序练习、随机练习及每日练习的题目范围。Android 与 iPhone / iPad 共用的移动端源码同步更新。

APK 与源码按现有流程上传 GitHub，生产服务器由站点维护者部署。**目录修复依赖后端更新，仅安装 APK 或清理手机缓存不能让旧后端应用修复。**

## 修复内容

- 普通题库按非 AI 生成题统计章节、知识点、题量和已刷进度，与网页普通题库保持一致。
- 修复旧 AI 题保留“网络层协议 / IPv4”等分类后，App 多出章节、网络管理题量偏多的问题。
- 新移动端明确请求普通题库，并使用与旧混合范围不同的题目缓存标识；更新后的后端也兼容旧 App 的普通练习请求。
- AI 题组、公开共享、收藏、错题及总学习历史继续保留，无需修改或删除用户 AI 题。
- 网页“使用其他用户生成的 AI 题目”只统计其他账号在同证书下共享的题。自己的上传题数在“共享 AI 题库 → 我的贡献”查看；该统计规则保持原样。

## 安装包

- 文件：`public/downloads/kaojiang-v0.3.6.apk`；`mobile/kaojiang-v0.3.6.apk` 为相同副本。
- 包名：`com.kaojiang.app`；versionName：`0.3.6`；versionCode：`20`。
- 正式证书 SHA-256：`986e4d8a00ce694362b2ac7883588e2775d3259201900c92b88978e797957a3b`。
- 正式签名的 v0.3.3 至 v0.3.5 可覆盖更新；旧 Debug 签名版需卸载后安装。
- 大小：73,542,586 字节，约 70.14 MiB；最低 Android SDK 24，目标 SDK 36；包含 arm64-v8a、armeabi-v7a、x86、x86_64。
- SHA-256：`fcd082e40e06846ca4df001df42bd4796623056a8a8bd7883f6451a5ece07dee`。
- 校验文件：`public/downloads/kaojiang-v0.3.6.apk.sha256`。

## 更新服务器

1. 在宝塔停止原 Node 项目，备份现有程序、`.env`、`DATA_DIR`（默认 `data/`，包括 SQLite、`-wal`、`-shm` 文件）及用户上传内容，备份仅留在私有位置。
2. 更新源码及安装包，保留服务器原有配置、数据库和上传文件。不要用电脑上的 `data/` 或 `.env` 覆盖服务器。
3. 安装根目录和移动端依赖，构建电脑网页及移动网页，最后重启原 Node 项目。

使用 Git 的服务器在项目根目录执行：

```sh
git pull --ff-only origin main
npm ci --include=dev
npm ci --prefix mobile --include=dev
npm run build
```

若服务器存在本地修改导致拉取失败，先保存并处理修改，不要强制重置。运行环境使用 Node.js 24 或更新版本。

通过宝塔上传文件时，同步 `server/`、`src/`、`mobile/` 的源码及配置（不含本机依赖、原生构建目录、密钥与环境文件）、`public/`、`scripts/`、`docs/`、`index.html`、`vite.config.js`、`package.json` 和 `package-lock.json`，然后执行依赖安装与构建。务必包含修复后的 `server/index.js` 与 `mobile/src/api/client.ts`。

完整构建会输出 `dist/` 和 `dist/app/`，并将 APK 复制到 `dist/downloads/`；苹果移动版部署规则见 [苹果移动版说明](apple-web.md)。

## 更新版本提示

若原 `.env` 或宝塔进程环境设有版本配置，更新以下三项；保留原有 `AI_MASTER_KEY`、`DATA_DIR`、`MOBILE_MINIMUM_VERSION` 及其他配置。

```dotenv
MOBILE_LATEST_VERSION=0.3.6
MOBILE_DOWNLOAD_URL=/downloads/kaojiang-v0.3.6.apk
MOBILE_RELEASE_NOTES=修复普通题库混入 AI 生成题导致的旧分类和题数偏差，统一网页、App 与移动网页的目录及练习范围；保留 AI 题组、共享、收藏与错题记录。
```

宝塔进程环境优先于 `.env`，调整后重启原服务；本版默认最低支持版本仍为 v0.2.8。

## 部署后确认

- `/api/mobile/version?version=0.3.5` 返回 `latestVersion: 0.3.6`，下载地址指向新 APK。
- `/downloads/kaojiang-v0.3.6.apk` 能下载，SHA-256 与校验文件一致。
- 同一账号、同一证书下，App 普通题库与网页未勾选共享 AI 时的目录、题量及已刷进度一致。
- 在 App 下拉刷新目录；旧 AI 题独有的分类不再混入普通题库，AI 题组仍能打开和练习。
- iPhone / iPad 打开 `/app/` 或使用“刷新到最新版本”，版本为 v0.3.6。
- 已上传题组、收藏、错题、会员和历史学习记录仍可正常访问。

## 构建与验证记录

- Android `assembleRelease` 成功，用时 55 秒；APK 签名与包名、版本号、SDK 和架构核对通过。
- APK 与 v0.3.5 的正式签名证书一致；`mobile/`、`public/downloads/` 和本地 `dist/downloads/` 三份 APK 的 SHA-256 一致。
- `npm run build` 成功，电脑网页与移动网页均已生成；移动网页版本 `0.3.6`，本机 buildId 为 `56367e94b0913f02`。其他环境重新构建时 buildId 可能不同。
- 修复阶段已使用隔离数据库复现旧分类 3 题、网络管理多 10 题的情况；目录、普通练习、AI 题组、收藏、错题、账号隔离与共享计数的回归检查通过。
- 未进行真机安装与交互验收。本机请求线上版本接口遇到 TLS 连接错误，未确认线上版本；GitHub 上传不代表生产服务器完成部署。
