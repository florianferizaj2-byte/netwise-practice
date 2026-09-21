# 考匠移动端

这是考匠的 Expo / React Native 移动端 v0.1.1。它复用现有 Node 后端，通过移动端 Bearer 会话连接生产 API。

## 本地预览

```powershell
cd mobile
npm install
npm start
```

然后：

- Android 真机安装 Expo Go，扫描终端二维码；
- 已安装 Android Studio 时，可以按 `a` 启动 Android 模拟器；
- 需要连接真实后端时，复制 `.env.example` 为 `.env.local`，将 `EXPO_PUBLIC_API_URL` 改成电脑在局域网中的地址。

App 保留开发期“进入预览模式”入口，用于查看动画和页面结构；真实登录通过移动端 Bearer 会话接入，证书选择后会请求首页学习数据。生产构建对应 `kaojiang-v0.1.1.apk`。

## 当前页面

- 今日：学习概览、连续学习、今日任务
- 练习：从题库加载真实题目并提交答题记录，支持顺序刷题和随机刷题
- 错题：加载当前账号的真实错题，并从错题集独立开始复习
- 考试：考试模式入口占位
- 我的：账号、证书、服务地址、版本信息和退出登录
