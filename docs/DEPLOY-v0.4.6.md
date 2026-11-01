# v0.4.6 服务器更新

在服务器现有项目目录沿用当前分支，先备份 .env 和完整 DATA_DIR。保持原数据库、公告、头像目录及上传内容；不要用示例环境配置覆盖原密钥。

```sh
git pull --ff-only
npm ci --include=dev
npm ci --prefix mobile --include=dev
npm run build
```

构建成功后用原来的方式重启现有 Node 服务；PM2 使用已有服务名并带 --update-env，宝塔在原项目中重启。无需另外启动新端口。

服务启动自动添加头像字段和创建 DATA_DIR/avatars；保留整个 DATA_DIR，资料随账号持久保存。已有 mobile-announcement.json 不会被覆盖，管理员仍可从手机端管理中心热调整标题、正文与显示开关。当前启用公告在 App 每次启动时先弹出，未登录用户也可读取。

也可从本次 GitHub Release 下载已经构建的服务器更新包，合并到现有项目、安装生产依赖后重启；仍需保留上述配置和数据。

## 更新后核对

1. /api/mobile/version?version=0.4.5 返回最新和最低版本 0.4.6、forceUpdate=true。
2. /api/mobile/version?version=0.4.6 返回 forceUpdate=false。
3. /app/version.json 为 version=0.4.6；/api/mobile/announcement 返回管理员当前公告。
4. 官网下载页显示 v0.4.6，提供 /downloads/kaojiang-v0.4.6.apk。文件 73,887,691 字节，SHA-256 为 8d9fc548e31950c2e9007fe2de224b786d57312ea061f5e05502bd7d818654cc。
5. 任一新旧 App 账号需补全名字和头像；重新登录可恢复。网页管理员“用户管理”可看到头像和昵称，并能按昵称搜索。
6. 新 App 进入时弹当前公告，关闭后继续；定位教程右上角“求助作者”显示微信好友二维码。

服务器拉取、构建和重启完成后再核对线上接口与下载文件。GitHub 发布和本地测试不能证明服务器已经更新。
