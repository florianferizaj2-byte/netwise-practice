# 考匠 Android v0.4.8

本次以用户提供的开屏测试 APK 对应源码为基础，增加可跳过的版本更新提示，并将最低支持版本调整为 **0.4.3**。服务端部署与手机实测分别验收，GitHub 上传不代表官网策略已经生效。

## 安装包

- 包名 `com.kaojiang.app`，版本 `0.4.8`，内部构建号 **33**。
- 用户原始 `考匠-v0.4.8-开屏测试.apk` 为 code 32，保持原文件不变；正式候选重新构建，以便实际二进制包含本次更新交互。
- APK：`kaojiang-v0.4.8.apk`，80,427,397 字节。
- SHA-256：`881750774378e832eba67ce45f2e81b689156aaa01fae5ea6d6032cd833e0cc4`。
- 签名证书 SHA-256：`986e4d8a00ce694362b2ac7883588e2775d3259201900c92b88978e797957a3b`，与原测试包及既有正式签名一致。
- Android 最低 API 24、目标 API 36；包含 arm64-v8a、armeabi-v7a、x86、x86_64。

[下载 APK](https://github.com/florianferizaj2-byte/netwise-practice/releases/download/v0.4.8/kaojiang-v0.4.8.apk) · [校验文件](https://github.com/florianferizaj2-byte/netwise-practice/releases/download/v0.4.8/kaojiang-v0.4.8.apk.sha256)。

## 更新行为

最新版本与最低版本分开管理：`latestVersion=0.4.8`、`minimumVersion=0.4.3`。

- 低于 0.4.3：`forceUpdate=true`，移动 API 返回 426，更新页不提供跳过按钮。
- 0.4.3–0.4.7：`updateAvailable=true`、`forceUpdate=false`，移动 API 正常使用。
- 0.4.8 及更高：不提示本次更新。
- 新客户端每次冷启动、从后台返回重新检查；可选择“继续使用旧版本”，不持久保存忽略决定。提示使用覆盖层，不替换底下的页面。
- 暂时无法检查版本时允许进入应用；已经确认的强制更新不会因后续检查失败而解除。受保护的 API 仍执行服务端最低版本检查。
- 浏览器更新仍走刷新页面流程；Android 保留应用内下载、系统安装确认和浏览器下载入口。

随代码发布的策略优先于旧环境配置，避免旧 `.env` 的 `minimumVersion=0.4.6` 把 0.4.3–0.4.5 再次拦截。只有显式配置严格高于内置最新版的 `MOBILE_LATEST_VERSION` 时，环境中的整组策略才覆盖内置值。

## 旧客户端兼容限制

已安装的 0.4.3–0.4.5 只处理 `forceUpdate`，没有可跳过的更新界面；0.4.6、0.4.7 和 code 32 的 0.4.8 也未处理可选更新。降低最低版本可以让它们继续使用，但不能远程给它们补“继续使用”按钮或保证每次启动自动弹出可选更新。

本次 code 33 已实现该交互，后续发布新版即可使用。旧包用户需要手动安装一次此包；code 32 同为 0.4.8，需手动下载安装 code 33。已有启动公告仍可用于文字通知，但它不等同于版本更新功能。本次未擅自覆盖管理员保存的公告。

## 本地验收

- `npm run typecheck`：通过。
- `npm run build`：通过，桌面与手机网页为 0.4.8。
- `node --test test/mobile-version.test.js test/mobile-release-policy.test.js test/api.test.js`：28 项通过，覆盖旧环境配置、最低版本边界、登录、刷题、考试与管理接口。
- 原生 Release 构建成功；原生单元测试 68 项通过，模块 Lint 0 错误、26 项警告。
- `apksigner` 签名核验通过；`aapt` 版本、包名、SDK、架构核对通过。APK 中的 Hermes 字节码包含“继续使用旧版本”和新开屏内容，已与旧 code 32 包区分。
- `node test/mobile-update.e2e.js`：通过。实际构建页面验证可跳过、刷新后再次提示、后台返回再次提示、输入状态保留、强制更新不可跳过、重试与网络失败放行；360×640 视口无横向溢出。
- `node test/mobile-release-publish.e2e.js`：通过。官网下载页展示 0.4.8，完整 HTTP 下载的字节数与 SHA-256 一致，Range 返回 206；0.4.5 可选更新、0.4.2 强制更新，手机网页版本一致。
- 附加的 `mobile-web.e2e.js` 全流程未通过：WebKit 在页面切换后报告 `/api/ai/questions/generations` 的访问控制错误，两次复现；登录、答题、考试、公告与版本刷新操作已执行，但最终零错误断言失败，尚未定位。此问题未被忽略或改动验收阈值，不能据此声称手机网页全回归通过。

未验收：真机覆盖安装、原生安装器权限与返回、实体设备开屏观感、生产网站更新策略。本次不操作物理服务器。
