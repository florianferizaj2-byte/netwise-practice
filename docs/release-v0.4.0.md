# v0.4.0 Android 更新

2026-10-09。将当前移动端源码打包为新版 Android APK，包含 VIP AI 精讲与练习、逐课讲解、填空作答、AI 老师问答及判分复核，并同步移动端界面与学习流程更新。

## 下载与安装

发布页：[考匠 v0.4.0](https://github.com/florianferizaj2-byte/netwise-practice/releases/tag/v0.4.0)。附件包含 `kaojiang-v0.4.0.apk`、对应的 `.sha256` 校验文件及本说明。

- 包名：`com.kaojiang.app`；versionName：`0.4.0`；versionCode：`24`。
- 沿用现有正式证书，相同正式签名的 v0.3.3 至 v0.3.9 可覆盖更新。
- 正式证书 SHA-256：`986e4d8a00ce694362b2ac7883588e2775d3259201900c92b88978e797957a3b`。
- 生产 API：`https://aceexam.top/api`。
- 大小：73,614,378 字节（约 70.2 MiB）；最低 Android SDK 24，目标 SDK 36；包含 arm64-v8a、armeabi-v7a、x86 和 x86_64。
- APK SHA-256：`57081dc35a2dc55af917a8ef34f697865985129ad7ecfb99d519c03099c7fde5`。

## APK 验证

Android Release 构建通过。已核对 APK 正式签名、包名、版本号、SDK、四种架构及安装包内的生产 API 地址；构建目录的 74 个应用源码、资源和配置文件与当前工作区逐一一致。当前未连接 Android 设备，真机安装与覆盖升级尚未验证。

发布检查全部通过：题库结构与移动端类型检查、120 项单元及接口测试（0 失败）、电脑与移动网页构建、电脑浏览器流程、VIP 精讲与练习、移动网页 Chromium / WebKit 流程、布局与无障碍检查、移动端 AI 精炼流程。AI 测试使用模拟服务。移动网页 buildId 为 `d06221ad9b082fec`，构建后的下载目录与正式 APK 校验值一致。

## 配套服务器

新学习功能需要部署包含 `/api/study/` 接口的当前后端。当前源码分支为 `desktop-workspace-downloads`，发布标签为 `v0.4.0`；生产服务器由站点维护者部署。

需要更新网站下载入口和旧 App 更新提示时，同步当前服务器代码、完整网页构建与新版 APK，并更新以下版本配置后重启服务：

```dotenv
MOBILE_LATEST_VERSION=0.4.0
MOBILE_DOWNLOAD_URL=/downloads/kaojiang-v0.4.0.apk
MOBILE_RELEASE_NOTES=新增 VIP AI 精讲与练习：知识点逐课讲解、填空练习、AI 老师答疑与判分复核。
```

最低支持版本保持 `0.2.8`。保留原服务器 `.env`、数据库、用户上传和 AI 服务配置。上传 GitHub 不会自动更新生产站点。
