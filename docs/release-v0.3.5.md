# v0.3.5 更新与服务器部署

本版安装包包含全新 App 练习页：顺序、随机、AI 出题及收藏、已生成题组入口，支持展开和搜索知识点目录。网页新增 VIP 中心，支持查看套餐及额度、签到、兑换和查询兑换记录。

本次发布 APK 与源码到 GitHub。服务器部署由站点维护者执行。

## 安装包

- 文件：`public/downloads/kaojiang-v0.3.5.apk`（`mobile/` 中有相同副本）。
- 包名：`com.kaojiang.app`；versionName：`0.3.5`；versionCode：`19`。
- 大小：73,539,854 字节，约 70.13 MiB。
- 最低 Android SDK 24，目标 SDK 36；包含 arm64-v8a、armeabi-v7a、x86、x86_64。
- SHA-256：`40ca844b1e69f023ac7579e2974c509993ef594903ac400419ebca771fd8762e`。
- 校验文件：`public/downloads/kaojiang-v0.3.5.apk.sha256`。
- 正式证书 SHA-256：`986e4d8a00ce694362b2ac7883588e2775d3259201900c92b88978e797957a3b`。
- 与正式签名的 v0.3.3、v0.3.4 使用同一证书，可覆盖更新。旧 Debug 签名版需要卸载后安装。

## 更新服务器

练习页沿用现有接口；网页版 VIP 中心依赖已有会员接口。服务器至少需要包含 v0.3.4 的会员和考试后端，建议同步本次源码与安装包。

1. 在宝塔停止原 Node 项目，私下备份服务器 `.env`、`DATA_DIR`（默认 `data/`，包含 SQLite 及相关 `-wal`、`-shm` 文件）和上传文件。
2. 更新项目代码，保留服务器原有配置与数据库，不要用本机数据覆盖生产数据。
3. 重新构建网页并重启原服务。

通过 Git 管理的服务器可在项目目录执行：

```sh
git pull --ff-only origin main
npm ci --include=dev
npm run build
```

若存在本地修改导致无法拉取，先保存并处理，不要强制重置。通过宝塔上传文件时，同步 `src/`、`server/`、`public/`、`docs/`、`index.html`、`vite.config.js`、`package.json` 和 `package-lock.json`，再安装依赖、构建网页。新增的 `src/vip-view.jsx` 和 `src/vip.css` 必须一并上传。

网页构建会把 `public/downloads/kaojiang-v0.3.5.apk` 复制到 `dist/downloads/`。

## 版本提示

若服务器 `.env` 或宝塔进程环境中设置了版本参数，同步更新下面三项。保留原有 `AI_MASTER_KEY`、`DATA_DIR`、`MOBILE_MINIMUM_VERSION` 和其他配置。

```dotenv
MOBILE_LATEST_VERSION=0.3.5
MOBILE_DOWNLOAD_URL=/downloads/kaojiang-v0.3.5.apk
MOBILE_RELEASE_NOTES=练习页全新布局：顺序、随机、AI 出题与收藏、已生成题组入口更清晰，知识点支持展开、搜索和查看进度；修复 AI 模式下进入收藏的流程。网页新增 VIP 中心，支持签到、兑换和额度查询。
```

宝塔进程环境优先于 `.env`；更新后重启原 Node 项目。本版默认最低版本仍为 v0.2.8。

## 部署后确认

- `/api/mobile/version?version=0.3.4` 返回 `latestVersion: 0.3.5`。
- `/downloads/kaojiang-v0.3.5.apk` 可下载，校验值与上文一致。
- 网页 VIP 中心能显示当前套餐，签到和兑换后刷新权益。
- App 练习页可正常切换三种模式、进入收藏和题组、展开及搜索知识点。
- 原有账号、会员、兑换码和学习记录完整保留。

## 本地构建记录

- Android `assembleRelease` 成功，使用现有正式签名；APK 元数据与签名核对通过。
- 两份 APK 的 SHA-256 一致；App TypeScript 编译、网页生产构建和后端语法检查通过。
- 未进行真机安装与交互验证。GitHub 上传不代表线上服务器已部署。
