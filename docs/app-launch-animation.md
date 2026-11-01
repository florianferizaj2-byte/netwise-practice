# App 中央开窗动画

2026-10-20：按用户选定的「中央开窗」接入 Android / 原生 App。

## 体验

- 中央使用现行 App 图标 `mobile/assets/icon.png` 的手写「考」字矢量轮廓，保持品牌形状与比例。
- 印章、细线窗框和文字依次显现，标语为「更适合你的刷题软件」。
- 常规介绍段 1320ms，圆角窗口展开 860ms；遵循用户动画速度设置。介绍结束后等待已注册的首屏阶段就绪，再留两帧布局时间展开。
- 首屏、登录态恢复与公告读取同时进行。首页统计和目录就绪（或请求明确失败）后解除对应等待；缓存可直接满足就绪条件。
- 公告在窗口展开后显示，首页不会因公告而延迟挂载。公告读取包括本地缓存的截止时间为 2 秒，启动等待上限为 5 秒，超时展开后由页面原有骨架/错误状态接管。
- 深浅外观均有配色；减少动态效果时直接显示文案，以 160ms 淡出替代缩放和开窗。

## 实现入口

- `mobile/src/launch/AppLaunch.tsx`：启动协调、原生系统开屏交接、内容预挂载。
- `mobile/src/launch/LaunchSurface.tsx`：SVG 图标及开窗。逐帧属性只使用 transform / opacity，交由原生动画驱动，动画不占交互任务。
- `mobile/src/launch/LaunchReadiness.ts`：路由、首页、公告就绪信号；页面替换时释放旧等待。
- `mobile/src/components/LaunchAnnouncement.native.tsx`：原生公告与页面并行加载。
- `AppLaunch.web.tsx` 使用原有网页流程。原公告组件保留给网页。
- `mobile/assets/kaojiang-launch.svg` 与 `kaojiang-vector.ts` 来自相同轮廓；`kaojiang-launch.png` 是该矢量的栅格导出，仅供操作系统静态开屏资源生成使用。

新增 `expo-splash-screen` 与 `react-native-svg`，版本由当前 Expo SDK 的安装器选择。原生资源有变化，必须重建安装包才能在手机上使用。

## 本机验证

- TypeScript 检查通过。
- 移动网页导出通过，原生开窗组件不进入网页入口。
- 在隔离副本中执行 Android prebuild 成功，开屏资源和配置插件生成成功。
- Android 完整 APK 构建通过，Hermes 正常编译。此前从中文路径调用编译器时 `-out` 写入失败；在 `C:\aceexam-rp\mobile` 英文构建副本中，同一编译器输出正常，无需修改工程的 Hermes 引擎设置。
- `node test/app-launch.e2e.js` 验证六种场景：公告等待中预挂载首页、首页慢加载、首页无响应、公告缓存无响应、启动时替换页面、减少动态效果。测试渲染实际原生协调组件，使用 RN Web 与平台 API 替身，因此不构成原生帧率或 TalkBack 验收。
- 可播放预览使用实际 `LaunchSurface` 组件；预览后的首页为示意。两种开窗、深色、减弱动画和 375px 布局检查通过。

已生成 0.4.8（versionCode 32）的本地签名 APK，沿用旧版证书。安装和真实手机冷启动、帧率、字体缩放及 TalkBack 验收由用户进行；未提交、推送或发布。交付信息见 `docs/release-v0.4.8.md`。

本机记录：`outputs/launch-window-20261020/`、`test-output/app-launch/verification.json`。修改前源码保存在 `aceexam-backups/launch-window-20261020/`。
