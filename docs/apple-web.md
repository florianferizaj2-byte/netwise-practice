# 考匠苹果移动版

## 入口与共用代码

iPhone / iPad 在 Safari 访问站点首页，自动进入 `/app/`。登录页和“我的”提供添加到主屏幕的说明。用户仍使用原考匠账号；Safari 和主屏幕 App 的网站数据可能隔离，首次从图标打开时如需登录，使用同一账号即可。

苹果网页直接构建 `mobile/App.tsx` 与 `mobile/src/navigation/AppShell.tsx`。今日、练习、错题、考试、VIP、我的及其子页面均与 Android 共用源码；没有单独复制一份苹果业务页面。

## iOS 界面与字体 · 2026-10-08

苹果网页使用独立的展示样式，覆盖登录注册、证书选择、六个主页面、AI 出题与精炼课程、社区与排行榜、兑换、设置、答题卡和提示弹窗。业务流程和账号接口继续共用。

- 浅色使用 iOS 分组背景、白色列表和蓝色操作；深色使用黑色背景与分层灰色表面。底部导航使用统一的矢量图标和半透明背景。
- 字体通过 `system-ui` / `-apple-system` 调用设备系统字体。在 iOS 上由系统选择 SF Pro 和相应语言字体，简体中文保留 `PingFang SC` 回退。参考 [Apple 字体说明](https://developer.apple.com/documentation/technologyoverviews/fonts)、[Telegram 字体实现](https://github.com/TelegramMessenger/Telegram-iOS/blob/master/submodules/Display/Source/Font.swift)和 [Signal 常规 UI 字体实现](https://github.com/signalapp/Signal-iOS/blob/main/SignalUI/UIKitExtensions/UIFont%2BOWS.swift)。
- 正文以 17px 为主，说明文字使用 13–15px，页面标题使用 30–34px。正文常规字重、功能标题半粗、页面标题粗体；计时与进度数字使用等宽数字。启用字距与光学字号处理，避免浏览器合成额外粗体。
- 触控按钮至少 44px，保留键盘焦点、系统减少动态效果设置和原有刘海、底部手势区、软件键盘适配。iPad 内容限制在适合阅读的宽度。
- 样式集中在 `mobile/src/iosStyles.ts`，通过主题接口仅用于移动网页；Android 保留原有配色和字体。没有打包或下载 Apple 字体文件。

构建后运行 `npm run test:e2e:apple-ui`，检查 WebKit / Chromium 下 320px 小屏、393px 手机、844px 横屏和 1024px iPad 的主页面，以及深色、设置、课程入口、社区与兑换。截图保存在 `test-output/ios-ui/`。Windows 浏览器截图用于检查布局；SF Pro / 苹方的最终字形、系统文字大小和 Safari 键盘仍需在真实 iPhone / iPad 验收。

本次修改需要重新构建并发布 `dist/app/` 后才会在线生效；本地构建不代表生产站点已经更新。

| 能力 | 实现 |
| --- | --- |
| 登录、证书切换、昵称、退出 | 共用移动 API 和会话恢复逻辑 |
| 顺序、随机、每日练习、收藏、错题 | 共用题目组件、答题接口和学习缓存 |
| AI 提示、讲解、变式、后台出题与题组 | 共用请求、进度与服务器任务；后台持续运行的是服务端任务 |
| 模拟考试 | 共用选题、计时、答题卡、在线保存、继续考试、交卷与解析 |
| VIP、签到、兑换码与 API 权限 | 共用账户权益与接口；支付能力以现有服务端实际接入为准 |
| 社区文字、Emoji、图片与排行榜 | 共用服务端；网页图片选择直接从点击打开，过大的照片先压缩 |
| 主题、动画与音效 | 共用设置；网页音效使用同一组音频，通过用户手势开启播放 |
| 提示弹窗、下拉刷新 | 补充 React Native Web 中缺失的实现 |
| 安装、更新 | Safari 添加主屏幕；网页刷新获取新版本，Android 使用 APK 更新 |

共用客户端同时修正了社区发图的参数：仅提交图片内容和类型，本地预览地址不再发给接口。Android 源码同步获得此修复；已有 APK 需要下次重新构建发布后才包含它。

## 构建与发布

在项目根目录执行：

```sh
npm ci
npm ci --prefix mobile
npm run build
npm start
```

`npm run build` 先生成电脑网页，再从同一份移动源码导出 `dist/app/`。如果只重建苹果移动版，用 `npm run build:mobile-web`；`npm run build:desktop` 仅用于单独开发电脑网页，会清理 `dist`，完整发布必须使用 `npm run build`。

移动网页以 `/app/` 为固定基路径，API 使用当前网页站点的 `/api`。发布脚本忽略移动目录的 `.env`，防止将开发地址编入生产网页；独立 Expo 开发预览仍可使用 `EXPO_PUBLIC_API_URL`。

主屏幕图标由构建流程从 Android 同一个 `mobile/app.json` 图标源生成 180 / 192 / 512 三种尺寸，避免以后出现两个移动端图标不一致。

发布时同步当前 `server` 代码和完整 `dist`，保留服务器已有数据库、上传文件、`.env` 与加密主密钥。若服务器只接收构建产物，移动目录的构建依赖无需在运行服务器安装。

HTTPS 站点的反向代理应把 `/app/`、`/api/` 和其他站点请求一起交给 Node。直接用 Nginx 托管时，`/app/` 必须映射到 `dist/app/`，不能返回电脑网页的 `dist/index.html`。`index.html`、`sw.js`、manifest 和 `version.json` 应重新校验缓存；仅有内容哈希的脚本与素材可长期缓存。已部署的历史哈希资源可暂时保留，避免用户更新期间引用失效。

发布后检查：

- `/app/` 显示与安卓相同的六个页面；`/app/version.json` 返回当前版本与构建标识。
- `/app/manifest.webmanifest` 返回 JSON，`/app/sw.js` 返回 JavaScript；不存在的移动脚本返回 404。
- 根首页在 iPhone / iPad 进入移动页，`/?desktop=1` 可使用电脑版；安卓下载入口继续下载 APK。
- Safari 分享 → 添加到主屏幕 → 如有“作为网页 App 打开”则开启 → 添加。[Apple 安装说明](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/27/ios/27)

## 自行部署

本次按站点维护者要求，由维护者操作生产服务器。运行环境使用 Node.js 24 或更新版本，继续使用原 Node 项目、端口、域名和 HTTPS 配置。

### 方式一：宝塔上传已构建的更新包

适用于现有考匠 v0.3.5 站点。更新包名为 `kaojiang-apple-web-20260927-a5c511940da1a474.tgz`，包含完整电脑网页与苹果网页、服务端代码及内置题库、公共题图、依赖清单和本文；不含服务器配置、用户数据库、上传内容、依赖目录或 Android 安装包。

1. 在宝塔停止原 Node 项目，备份现有程序、`.env`、`DATA_DIR`（含 SQLite 的 `-wal` / `-shm`）和上传目录。
2. 把更新包上传到原项目根目录，即原来同时放有 `package.json`、`server/`、`dist/` 的目录。
3. 将压缩包解压到该目录，合并目录并覆盖同名程序文件。保留原 `dist/downloads/`、`public/downloads/` 和历史哈希资源，不要先删除整个 `dist`。解压后应能找到 `dist/app/index.html`、`dist/app/sw.js` 和 `dist/app/version.json`。
4. 在原项目目录执行 `npm ci --omit=dev`，然后在宝塔重启原 Node 项目；启动命令保持 `npm start`。包内网页已构建，使用这个更新包时无需再执行构建。
5. 原 `.env`、宝塔进程环境、数据库路径和 `AI_MASTER_KEY` 保持原值。本次 Android 版本仍为 0.3.5，最低支持版本无需调整。

如果使用命令行解压，在确认当前目录为原项目根目录后执行：

```sh
tar -xzf kaojiang-apple-web-20260927-a5c511940da1a474.tgz
npm ci --omit=dev
```

### 方式二：从 GitHub 拉取源码并构建

在已备份、停止服务的原 Git 项目目录执行；若拉取提示存在本地修改，先处理这些修改，不要强制覆盖：

```sh
git pull --ff-only origin main
npm ci --include=dev
npm ci --include=dev --prefix mobile
npm run build
```

完成后在宝塔重启原 Node 项目。完整构建会从 `public/downloads/` 复制当前 Android 安装包到 `dist/downloads/`。

### 上线验收

- 打开 `https://aceexam.top/app/version.json`，应得到 JSON，版本为 `0.3.5`；本次预构建包的 `buildId` 为 `a5c511940da1a474`。在其他操作系统自行构建时，构建标识可能不同。
- 用 iPhone 的 Safari 打开 `https://aceexam.top/app/`，使用原账号登录，检查今日、练习、错题、考试、VIP、我的六页，再添加到主屏幕。
- 如果 `/app/version.json` 返回电脑网页，说明新服务端尚未重启，或反向代理仍把 `/app/` 交给旧的电脑网页；把 `/app/` 与 `/api/` 转发给同一个原 Node 项目。
- 确认原账号与学习记录仍在，安卓下载入口可以打开。出现异常时，停止服务并恢复备份的程序与对应数据，再启动原项目。

## 更新与离线范围

Service Worker 只预缓存发布脚本列出的公共文件，不拦截 API、社区上传图片或其他网站页面。在线启动优先读取当前 HTML；新版已下载时不主动刷新正在作答的页面，用户可在“我的”手动刷新。最低版本提示在网页上显示刷新入口。

普通题页与目录继续由 `ResourceCache` 缓存；不把答案、错题、AI 私有题、聊天或 AI 密钥放进学习缓存。题目提交、AI、社区、兑换、考试保存需要联网。浏览器可能回收网站数据，离线内容与持久登录不能视作永久保存。

## 验证范围

```sh
node mobile/node_modules/typescript/bin/tsc --noEmit -p mobile
node --test test/mobile-cache.test.js test/mobile-client.test.js test/mobile-api.test.js
node test/mobile-web.e2e.js
```

最后一项需要 Playwright 的 WebKit 和 Chromium：`npx playwright install webkit chromium`。测试启动临时本地数据库，测试账号、题目与发图均留在该数据库中，结束后清理；不使用生产账号或真实 AI 额度。截图在 `test-output/apple-web/`。

桌面 WebKit 的移动视口检查不能替代 iPhone 真机验收。上线前仍需在 iPhone / iPad 检查主屏幕安装、刘海与底部手势区、系统键盘、相册原图、音效、锁屏恢复、弱网、首次安装及已安装版本的升级。网页与 Android 共用业务功能，但系统安装、浏览器存储与后台生命周期遵循各平台限制。

### 本次本地结果（2026-09-27）

- TypeScript 检查、完整网页构建、Android JavaScript 导出通过；没有重新生成 APK。
- 移动接口、缓存及社区图片参数的 16 项检查通过。
- WebKit 与 Chromium：苹果首页跳转、安装引导、注册与登录、六个导航页、下拉刷新、答题保持与错题同步、每日练习入口、签到与会员兑换、弹窗操作、社区文字和图片、考试保存／刷新／继续／交卷、主题恢复、退出登录、网页更新和 iPad 主屏幕模式通过。
- AI 讲解与流式变式题使用本地模拟响应，检查了页面与流式读取，没有验证真实模型效果；离线应用外壳和公共文件缓存范围在 Chromium 中通过。
- 生产服务器由站点维护者部署；本地结果不代表线上已更新。真实 iPhone / iPad 安装验收待部署后完成。
