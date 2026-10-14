# 虚拟定位学习接入考匠

2026-10-13。功能内置于考匠 Android App，入口位于“练习”中普通顺序或随机练习的章节列表底部，名称为“虚拟定位学习”，也支持在章节搜索框中搜索。每日挑战、AI 出题目录、网页、iOS 与未含原生模块的旧客户端不显示该入口。

## 使用流程

1. 点“虚拟定位学习”，先阅读“学习用途与免责协议”。协议明确仅供学习使用，严禁用于校园跑作弊、伪造跑步轨迹/里程/成绩和代跑等违规用途。
2. 不同意则返回；同意后才允许“开始”，同意本身不启动定位。每次重新进入均需重新同意。页面旋转的重建保留本次选择，不保存永久同意记录。协议属于用途告知，不代表可技术识别或阻止违规用途。
3. 首页仅“开始”“结束”两个主按钮，状态同步显示运行百分比。文字入口“使用教程”包含开发者选项、定位权限、后台运行和悬浮窗设置。
4. 在开发者选项的模拟位置应用中选择“考匠”，允许精确位置并开启系统定位开关。允许通知后可以通过通知结束；后台设置以手机实际菜单为准。
5. 点“开始”，按内置 24 个 WGS84 坐标以 12 km/h 顺序运行一次，终点自动结束并记录 100%。再次开始从起点重新运行。“结束”会撤销模拟位置提供器并释放运行唤醒锁。
6. “使用教程” → “显示悬浮按钮”，允许显示在其他应用上层和精确位置后，开启一个可拖动的悬浮按钮。空闲时新开启会提示“等待定位成功后再开启虚拟定位”，关闭提示不启动；定位是否成功由测试页面确认，本模块不检测其他应用的定位结果。点开始须再次同意协议，运行显示“结束 · 进度%”；停止或完成后保留“开始”。长按关闭悬浮窗，正在运行的路线继续。悬浮窗关闭且没有路线运行时，服务退出。

## 内置路线

用户文件“路线 10-12 22_50.rplroute.json”原样存入：

`mobile/modules/route-player/android/src/main/assets/kaojiang-route-player.rplroute.json`

SHA-256：`8a3fc98a9886572f3d28dd0d29b577adc5d5dbf603df7f92cd672633ccff4edb`。坐标顺序、速度与单次运行方式不改动；运行只读取此资源，不读取旧的自定义路线草稿。按最后确认的固定路线需求，本版不提供地图、路线编辑、导入导出或卡密界面。

## 工程结构

- `mobile/modules/route-player`：本地 Expo 原生模块，保留上游 MIT 许可。
- `RoutePlayerModule`：原生桥接模块 `AceExamRoutePlayer`，仅负责打开学习界面。
- `RoutePlayerChapter.tsx` 与 `PracticeHubScreen.tsx`：章节目录入口。服务端题库、题量和学习进度没有新增假章节。
- `RoutePlayerActivity`：强制协议、运行状态和系统权限提示。
- `SetupActivity`：动态读取宿主名称的手机设置教程。
- `MockLocationService`：定位前台服务，使用实际经过时间计算路线进度，结束、出错或销毁时清理；系统结束进程后不会自动重跑。
- `FloatingControl`：单按钮、百分比、拖动边界和长按关闭；Android 30 起使用匹配窗口类型的显示/窗口上下文。
- `LearningConsent`：进程内临时授权，防止未经协议确认的启动或悬浮窗请求；悬浮开始也必须经过协议。

Expo 默认发现 `mobile/modules/` 下的模块，重新生成 Android 工程仍可接入。模块的两个 Activity 和服务均不向外导出，没有独立桌面图标；不替换宿主包名、图标、主题或网络权限。

模块只存本地运行状态/进度、最后坐标、权限提示和悬浮窗位置/选项，不联网、不上传坐标，不保存卡密、账号或设备标识。协议同意不持久化。考匠其他学习功能继续使用原账号和服务器。Android 正常的模拟位置标记保留；此模块不伪造卫星信号强度。

开启悬浮窗会在可见教程页面创建前台定位会话，随后在同一个服务中进行路线开始/结束。空闲时不输出位置、不持有运行唤醒锁，保留控制与通知；关闭空闲悬浮窗后服务停止。该方式避免从后台重新创建需要使用期间权限的定位服务。系统强停或省电结束进程后不会自动重跑。

## 验证与重新打包

当前宿主版本为 v0.4.5 / versionCode 29。定位模块增加开启悬浮窗时的定位提醒，宿主另有首页公告和管理员界面；模块仍不联网。版本、TypeScript、移动网页构建、52 项原生本地测试、无错误的模块 Lint、正式签名与 APK 内容检查的本机结果见 [v0.4.5 版本说明](release-v0.4.5.md)。Expo 自动发现和生成的包列表包含 `com.kaojiang.routeplayer.RoutePlayerModule`。安装包为 `mobile/kaojiang-v0.4.5.apk`。旧版本记录见 [v0.4.4](release-v0.4.4.md)、[v0.4.3](release-v0.4.3.md)。

`scripts/verify-route-player-native.ps1` 默认仅执行原生检查；加 `-BuildApk` 会执行检查、构建正式 APK、运行 `verify-route-player-apk.py` 校验，再复制安装包和生成校验文件。使用独立短英文构建目录 `C:\aceexam-rp`、缓存目录 `C:\aceexam-route-gradle` 和临时目录，复制 CMake 到英文路径，避免 Windows 中文路径与长度错误。正式签名配置沿用 [签名说明](../mobile/RELEASE_SIGNING.md)，证书及密码保存在仓库外。

本地构建不会上传 GitHub、修改服务器最低版本或部署网站。尚无安卓手机连接，实际系统模拟位置、锁屏后台与覆盖安装效果仍需手机验收。

教程依据：[Android 开发者选项](https://developer.android.google.cn/studio/debug/dev-options?hl=zh-cn)、[前台定位服务](https://developer.android.google.cn/develop/background-work/services/fgs/service-types?hl=zh-cn)、[电池优化](https://developer.android.google.cn/training/monitoring-device-state/doze-standby?hl=zh-cn)。本地 Android 界面测试按 [Robolectric 官方配置](https://robolectric.org/getting-started/)设置，不替代手机定位与省电测试。
