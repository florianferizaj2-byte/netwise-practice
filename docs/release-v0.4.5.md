# 考匠 v0.4.5：手机管理中心、首页公告与定位提醒

2026-10-14。本机验证版，versionCode 29，包名 com.kaojiang.app。首页移除顶部“每一步，都有进度”和日期，公告栏直接放在学习内容前。

## 本次功能

- 首页预留简洁公告栏，点开查看全文。在线读取新公告，无需重新安装；返回首页、下拉刷新和首页前台每 60 秒触发检查。断网/无效响应保留上次有效内容，公告关闭状态也保留。
- 管理员在“我的 → 管理中心”搜索/筛选注册账号，查看注册时间、ID、昵称、题库、会员与封禁状态。可保存昵称、题库、会员等级及到期日期，确认后封禁或解封普通账号。
- “公告管理”支持编辑标题、正文与显示开关。保存后服务端立即提供新内容，手机直接刷新。普通用户没有管理入口，每个管理接口都独立检查管理员权限；修改留审计记录，并阻止旧版本内容覆盖新修改。
- 公告保存在 DATA_DIR/mobile-announcement.json，默认位于 data/mobile-announcement.json；首次从随服务发布的模板初始化，后续发布不会重置。支持指定独立文件位置并随数据备份。
- 新打开空闲悬浮窗时提示“等待定位成功后再开启虚拟定位”。点“知道了”不会自动开始，仍要手动开始并同意学习用途协议。教程与空闲通知保留提醒；不检测或宣称其他应用已经定位成功。

学习定位继续使用原样 24 点 WGS84 内置路线、12 km/h、单次运行到终点结束；运行显示百分比，停止后悬浮按钮回到开始。学习用途协议、精确位置/模拟定位/系统定位开关检查及 Android 模拟位置标记保持有效。定位模块本身仍离线，不向账号或公告服务上传坐标。

操作说明：[手机管理与公告](MOBILE-ADMIN-ANNOUNCEMENTS.md)、[定位模块接入](ROUTE-PLAYER-INTEGRATION.md)。

## 安装包与签名

[下载 APK](https://github.com/florianferizaj2-byte/netwise-practice/releases/download/v0.4.5/kaojiang-v0.4.5.apk) · [SHA-256](https://github.com/florianferizaj2-byte/netwise-practice/releases/download/v0.4.5/kaojiang-v0.4.5.apk.sha256)。大小 73,742,723 字节，约 70.33 MiB；最低 SDK 24、目标 SDK 36，包含 arm64-v8a、armeabi-v7a、x86、x86_64。

APK SHA-256：7e02ffb0b8ccc5204280fbd5c5994dcb1ea95dd3dbaf9b12838496fc60aed8b0。

正式签名证书 SHA-256：986e4d8a00ce694362b2ac7883588e2775d3259201900c92b88978e797957a3b，与原正式版本一致。签名校验通过，Release 包没有调试框架，仅保留考匠原启动入口。API 沿用 https://aceexam.top/api。

## 本机验证

- 52 项 Android 本地测试通过，0 失败、0 跳过；包含新增提醒确认后仍不启动、重复开启不重复弹出、关闭后重开再次提示，以及原有路线、协议、悬浮按钮、百分比和权限流程。模块 Lint 0 错误、24 项既有警告。
- 14 项版本、公告和管理测试通过：未登录/普通账号被拒绝，分页/搜索/筛选有效，敏感信息不返回，昵称/题库/会员保存生效，封禁撤销会话，公告即时发布/持久化/关闭和并发修改冲突有效，离线缓存与格式校验有效。
- TypeScript、版本一致性及移动网页构建通过。
- Chromium 与 WebKit 的公告专项界面检查通过：公告栏、全文、无需重装的内容更新、缓存恢复、远程关闭、320 像素窄屏与深色模式；首页顶部标题/日期确已移除。
- Chromium 与 WebKit 的管理专项界面检查通过：普通账号无入口、管理员搜索并保存账号、跨账号公告发布/隐藏、封禁/解封及会话撤销；窄屏没有横向溢出。
- 原有移动网页端到端回归在 WebKit 与 Chromium 通过，覆盖注册/证书、六个页面、下拉刷新、答题/错题同步、AI 测试响应、会员/签到、社区、考试保存/恢复/提交、主题、退出与 iPad 入口。Chromium 另验证离线缓存；AI 使用本地测试响应，不表示线上 AI 服务验收。
- Release 原生构建通过；正式签名、包名/版本/SDK/四架构、首页简化、公告及管理员入口、原生桥接、免责/提醒资源、原样路线、MIT 许可与权限清单检查通过。
- 核对 128 个运行时源码、资源与配置文件和英文构建副本一致；安装包、构建原件、校验文件与验证报告的大小/SHA-256 一致。

报告位于本机 test-output/mobile-admin-tests.log、test-output/mobile-admin/report.json、test-output/announcement/report.json、test-output/route-player-mobile-web-e2e.log、test-output/route-player-apk-verification.json。原生报告位于 C:\aceexam-rp\mobile\modules\route-player\android\build。

## 发布与服务器更新

本版发布策略将最新版和最低支持版本设为 v0.4.5，官网路径为 /downloads/kaojiang-v0.4.5.apk。服务器保留的旧环境配置不会恢复旧版本阈值或旧下载链接。旧客户端打开时要求升级，访问受保护移动接口返回 HTTP 426；当前版本及普通官网不受影响。

GitHub main 和 desktop-workspace-downloads 同步发布源码、官网安装包与校验文件；Release 另提供安装包和已构建服务器更新包。服务器需要拉取、完整构建后重启，详见 [更新步骤](DEPLOY-v0.4.5.md)，保留现有 .env、DATA_DIR、公告与上传内容。线上效果以更新后接口和安装包核对为准。

隔离发布副本的 155 项完整回归测试、版本/类型/题库检查及既有浏览器流程全部通过，另检查手机管理、公告和官网安装包下载。GitHub 上传和服务器实际重启分别验收，不能由本机检查推断线上已生效。

真机的悬浮授权、跨应用显示、锁屏/省电后台、模拟位置接收和覆盖安装尚未验证。浏览器与本地 Android 运行时检查不代替手机验收。
