# 虚拟定位学习接入考匠

2026-10-15。功能内置于考匠 Android App，入口位于“练习”中普通顺序或随机练习的章节列表底部，名称为“虚拟定位学习”，也支持在章节搜索框中搜索。每日挑战、AI 出题目录、网页、iOS 与未含原生模块的旧客户端不显示该入口。

本页描述包含尚未打包发布的路线选择功能；已发布的 v0.4.6 APK 仍使用原来的固定路线。

## 使用流程

1. 点“虚拟定位学习”，先阅读“学习用途与免责协议”。协议明确仅供学习使用，严禁用于校园跑作弊、伪造跑步轨迹/里程/成绩和代跑等违规用途。
2. 不同意则返回；同意后才允许“开始”，同意本身不启动定位。每次重新进入均需重新同意。页面旋转的重建保留本次选择，不保存永久同意记录。协议属于用途告知，不代表可技术识别或阻止违规用途。
3. 首页保留“开始”“结束”两个主按钮，增加“路线”选择控件，显示当前路线、速度与循环方式，状态同步显示运行百分比。文字入口“使用教程”包含开发者选项、定位权限、后台运行和悬浮窗设置；右上角“求助作者”显示微信好友二维码，可截图后用微信扫一扫识别。
4. 在开发者选项的模拟位置应用中选择“考匠”，允许精确位置并开启系统定位开关。允许通知后可以通过通知结束；后台设置以手机实际菜单为准。
5. 先选择路线，再点“开始”。三条路线均循环运行，到最后一点后直接跳回起点继续，不额外运行终点至起点的连线，百分比按当前圈重新计算，直到手动结束。再次开始均从起点运行。运行或等待开始/结束期间不可切换路线。“结束”会撤销模拟位置提供器并释放运行唤醒锁。
6. “使用教程” → “显示悬浮按钮”，允许显示在其他应用上层和精确位置后，开启一个可拖动的悬浮按钮。空闲时新开启会提示“等待定位成功后再开启虚拟定位”，关闭提示不启动；定位是否成功由测试页面确认，本模块不检测其他应用的定位结果。点开始须再次同意协议，运行显示“结束 · 进度%”；停止或完成后保留“开始”。长按关闭悬浮窗，正在运行的路线继续。悬浮窗关闭且没有路线运行时，服务退出。

## 内置路线

三份用户文件均原样保留，坐标不转换、不打乱；显示名称和循环方式由 `BuiltInRoutes` 配置：

- “瞎JB乱跑”：原“路线 10-12 22_50.rplroute.json”，资源 `kaojiang-route-player.rplroute.json`，24 个 WGS84 点，12 km/h，到终点跳回起点循环。
- “操场循环跑”：第一个新文件“路线 10-15 18_20.rplroute.json”，资源 `stadium-route.rplroute.json`，4 个 WGS84 点，20 km/h，到终点跳回起点循环。
- “爱心”：第二个新文件“路线 10-15 18_22.rplroute.json”，资源 `heart-route.rplroute.json`，22 个 WGS84 点，20 km/h，到终点跳回起点循环。

资源目录为 `mobile/modules/route-player/android/src/main/assets/`。三份文件的 SHA-256 按上述顺序为 `8a3fc98a9886572f3d28dd0d29b577adc5d5dbf603df7f92cd672633ccff4edb`、`4b9725171d9b3067e5757f74df90725ffe5758fea973215072fdcb426a51e7e3`、`9cb3d3c939eecdb0f10e324e9cb703e998bb7ddeb0281e5385eec9b085b9e44c`。三份原始文件的元数据均为 `ONCE`，仅播放时覆盖为 `RESTART`。

选择按稳定路线 ID 保存在本机，重进页面保留。首页与悬浮窗读取同一选择；首页启动请求携带路线 ID 快照，运行页显示实际运行的路线。未知的启动路线 ID 会报错，不会改跑默认路线。速度取各文件原值；尚未提供自定义速度/时间、地图编辑、导入导出或卡密界面。

## 工程结构

- `mobile/modules/route-player`：本地 Expo 原生模块，保留上游 MIT 许可。
- `RoutePlayerModule`：原生桥接模块 `AceExamRoutePlayer`，仅负责打开学习界面。
- `RoutePlayerChapter.tsx` 与 `PracticeHubScreen.tsx`：章节目录入口。服务端题库、题量和学习进度没有新增假章节。
- `RoutePlayerActivity`：强制协议、路线选择、运行状态和系统权限提示。
- `BuiltInRoutes` / `BuiltInRouteStore`：内置路线目录、合法 ID 校验、资源读取和本地选择保存。
- `SetupActivity`：动态读取宿主名称的手机设置教程。
- `MockLocationService`：定位前台服务，使用实际经过时间计算路线进度，结束、出错或销毁时清理；系统结束进程后不会自动重跑。
- `FloatingControl`：单按钮、百分比、拖动边界和长按关闭；Android 30 起使用匹配窗口类型的显示/窗口上下文。
- `LearningConsent`：进程内临时授权，防止未经协议确认的启动或悬浮窗请求；悬浮开始也必须经过协议。

Expo 默认发现 `mobile/modules/` 下的模块，重新生成 Android 工程仍可接入。模块的两个 Activity 和服务均不向外导出，没有独立桌面图标；不替换宿主包名、图标、主题或网络权限。

模块只存本地路线选择、运行状态/进度、最后坐标、权限提示和悬浮窗位置/选项，不联网、不上传坐标，不保存卡密、账号或设备标识。协议同意不持久化。考匠其他学习功能继续使用原账号和服务器。Android 正常的模拟位置标记保留；此模块不伪造卫星信号强度。

开启悬浮窗会在可见教程页面创建前台定位会话，随后在同一个服务中进行路线开始/结束。空闲时不输出位置、不持有运行唤醒锁，保留控制与通知；关闭空闲悬浮窗后服务停止。该方式避免从后台重新创建需要使用期间权限的定位服务。系统强停或省电结束进程后不会自动重跑。

## 验证与重新打包

2026-10-15 的路线选择开发改动已通过 68 项原生本地测试、模块 Lint（无错误）及宿主 Debug Kotlin 编译。新增检查覆盖两个原始文件完整性、终点跳回起点的多圈运行、选择保存/页面重建、运行中锁定、悬浮启动使用已选路线，以及 375dp 小屏和横屏双倍字号布局。报告为 `outputs/route-selection/verification.json`。本次仅更新源代码，尚未生成或发布包含路线选择的新 APK；手机定位和后台效果仍待设备验证。

当前宿主版本为 v0.4.6 / versionCode 30。定位模块增加开启悬浮窗时的定位提醒，宿主另有首页公告和管理员界面；模块仍不联网。版本、TypeScript、移动网页构建、54 项原生本地测试、无错误的模块 Lint、正式签名与 APK 内容检查的本机结果见 [v0.4.6 版本说明](release-v0.4.6.md)。Expo 自动发现和生成的包列表包含 `com.kaojiang.routeplayer.RoutePlayerModule`。安装包为 `mobile/kaojiang-v0.4.6.apk`。旧版本记录见 [v0.4.4](release-v0.4.4.md)、[v0.4.3](release-v0.4.3.md)。

`scripts/verify-route-player-native.ps1` 默认仅执行原生检查；加 `-BuildApk` 会执行检查、构建正式 APK、运行 `verify-route-player-apk.py` 校验，再复制安装包和生成校验文件。使用独立短英文构建目录 `C:\aceexam-rp`、缓存目录 `C:\aceexam-route-gradle` 和临时目录，复制 CMake 到英文路径，避免 Windows 中文路径与长度错误。正式签名配置沿用 [签名说明](../mobile/RELEASE_SIGNING.md)，证书及密码保存在仓库外。

本地构建不会上传 GitHub、修改服务器最低版本或部署网站。尚无安卓手机连接，实际系统模拟位置、锁屏后台与覆盖安装效果仍需手机验收。

教程依据：[Android 开发者选项](https://developer.android.google.cn/studio/debug/dev-options?hl=zh-cn)、[前台定位服务](https://developer.android.google.cn/develop/background-work/services/fgs/service-types?hl=zh-cn)、[电池优化](https://developer.android.google.cn/training/monitoring-device-state/doze-standby?hl=zh-cn)。本地 Android 界面测试按 [Robolectric 官方配置](https://robolectric.org/getting-started/)设置，不替代手机定位与省电测试。
