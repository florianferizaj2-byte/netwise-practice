# v0.3.3 宝塔／服务器更新

本版包含 Android App、网页管理员和后端的会员兑换功能。请在服务器更新完成后发放兑换码。

## 1. 备份现有数据

在宝塔停止当前 Node 项目，再备份服务器的 `.env` 与 `DATA_DIR` 目录（默认 `data/`，包含 SQLite、相关 `-wal` / `-shm` 文件及用户上传文件）。这份备份仅留在私有位置。

更新代码时保留服务器原有数据库、上传文件和 `.env`。不要把电脑上的 `data/` 或 `.env` 上传覆盖到服务器。

## 2. 更新代码和网页

如果服务器项目通过 Git 管理，在项目目录运行：

```sh
git pull --ff-only origin main
npm ci --include=dev
npm run build
```

如果 Git 提示本地代码冲突，先备份并处理这些修改；不要用强制重置覆盖服务器配置。

如果通过宝塔上传源码更新，同步仓库中的 `server/`、`src/`、`public/`、`index.html`、`vite.config.js`、`package.json`、`package-lock.json` 和 `docs/` 后，运行后两条命令。`server/` 包含本次新增的 `memberships.js` 和 `membership-routes.js`，以及原有完整题库。

新的安装包位于 `public/downloads/kaojiang-v0.3.3.apk`，网页构建会把它复制到 `dist/downloads/`。

## 3. 调整版本信息

在服务器原有 `.env` 中更新这三项，其他配置保持原值：

```dotenv
MOBILE_LATEST_VERSION=0.3.3
MOBILE_DOWNLOAD_URL=/downloads/kaojiang-v0.3.3.apk
MOBILE_RELEASE_NOTES=新版VIP页面与会员兑换码上线，可在“我的→兑换码”开通或续期，管理员可查看会员及兑换码状态。原测试签名版需卸载后安装正式签名版，服务器账号和学习记录保留。
```

保留原有 `MOBILE_MINIMUM_VERSION`。如果这些值是在宝塔 Node 项目的环境变量界面设置的，也要修改对应项，因为进程环境变量优先于 `.env`。

## 4. 启动并查看

在宝塔启动／重启原 Node 项目。启动时自动升级现有数据库并生成首批兑换码：VIP、SVIP、SSVIP 各 10 个，每码 30 天；重复启动不会重复生成。

- 访问 `/api/mobile/version?version=0.3.2`，确认 `latestVersion` 为 `0.3.3`。
- 打开 `/downloads/kaojiang-v0.3.3.apk`，确认可以下载。
- 管理员面板 → 兑换码：查看服务器生成的 30 个码。
- 管理员面板 → 用户管理：查看用户会员等级与到期时间。
- App「我的 → 兑换码」用于开通会员；同等级可延长现有到期日，其他等级需当前会员到期后兑换。

服务器生成的码以服务器管理员面板为准，电脑本地数据库中的码不能用于服务器账号。

## 安装说明

包名 `com.kaojiang.app`，版本 `0.3.3`，Android versionCode `17`，使用正式签名。

已经安装相同正式签名版本的用户可以覆盖更新。旧 Debug 测试签名版需要卸载后安装；手机本地缓存与设置会清除，服务器账号和学习记录保留，重新登录即可。签名详情见 [正式签名说明](../mobile/RELEASE_SIGNING.md)。
