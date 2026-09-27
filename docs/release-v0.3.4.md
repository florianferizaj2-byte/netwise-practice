# v0.3.4 宝塔／服务器更新

本版更新 App 首页、错题与考试页面，网页同步支持多选大知识点组卷。App 考试需要本版后端，请先更新服务器，再分发安装包。

## 1. 备份并保留现有数据

在宝塔停止当前 Node 项目，备份服务器的 `.env` 与 `DATA_DIR`（默认 `data/`，包括 SQLite、相关 `-wal` / `-shm` 文件及上传文件）。备份仅存放于私有位置。

更新时保留服务器原有数据库、上传文件和 `.env`，不要用电脑上的同名文件覆盖。现有账号、会员、兑换码和学习记录继续使用。

## 2. 更新代码与网页

如果服务器通过 Git 管理，在项目目录执行：

```sh
git pull --ff-only origin main
npm ci --include=dev
npm run build
```

如果出现代码冲突，先保留并处理服务器修改，不要强制重置。

如果通过宝塔上传源码，同步仓库的 `server/`、`src/`、`public/`、`index.html`、`vite.config.js`、`package.json`、`package-lock.json` 和 `docs/`，然后执行依赖安装与网页构建。必须包含新增的 `server/exams.js` 与 `src/exam-scope.css`。

安装包位于 `public/downloads/kaojiang-v0.3.4.apk`；网页构建时会复制到 `dist/downloads/`。

## 3. 更新版本信息并重启

在服务器原有 `.env` 或宝塔 Node 项目环境变量中调整下面三项。其他值保持原状，尤其是 `AI_MASTER_KEY`、`DATA_DIR` 和 `MOBILE_MINIMUM_VERSION`。

```dotenv
MOBILE_LATEST_VERSION=0.3.4
MOBILE_DOWNLOAD_URL=/downloads/kaojiang-v0.3.4.apk
MOBILE_RELEASE_NOTES=首页展示刷题进度，错题页突出薄弱知识点，考试支持多选知识点组卷、暂存继续与考后复盘；修复每日学习占用普通练习入口的问题。
```

宝塔进程环境变量优先于 `.env`，如两处都设置了版本信息，请同步修改。完成后启动／重启原 Node 项目。

## 4. 更新后确认

- `/api/mobile/version?version=0.3.3` 返回 `latestVersion: 0.3.4`。
- `/downloads/kaojiang-v0.3.4.apk` 可以下载。
- 网页考试页可以多选大知识点，试卷只包含所选范围。
- App 可以组卷、暂存继续与交卷；交卷后首页进度、错题列表更新。
- 从每日学习返回今日，再进入练习，可以切换至知识点练习或 AI 出题。

这些是服务器更新后的确认步骤，GitHub 上传本身不代表宝塔服务已部署。

## 安装与考试记录

- 包名：`com.kaojiang.app`；版本：`0.3.4`；versionCode：`18`。
- 沿用现有正式签名，正式签名的 v0.3.3 可以覆盖更新；旧 Debug 签名版需要卸载后安装。
- 考试按账号和证书隔离，答案在线保存到服务器；暂存退出后计时继续，超时按服务器已保存答案交卷。
- 早期未关联账号的旧考试草稿无法归属到具体用户，本版不把这些草稿分配给任意账号。

## 构建记录

- Android Release 构建成功；App TypeScript 检查、网页生产构建和后端语法检查通过。
- APK 大小：73,532,782 字节；最低 Android SDK 24，目标 SDK 36，包含四种架构。
- APK SHA-256：`2089d6894773acc97622dcd0e8d769b8ca0a3267f6fcd6b1c4626a63e948f246`。
- 正式签名 SHA-256：`986e4d8a00ce694362b2ac7883588e2775d3259201900c92b88978e797957a3b`，与 v0.3.3 一致。
- 校验文件：`public/downloads/kaojiang-v0.3.4.apk.sha256`。
- 尚未进行真机安装与交互验证；宝塔部署由站点维护者执行。
