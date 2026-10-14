# v0.4.5 服务器拉取更新

GitHub 的 main 与 desktop-workspace-downloads 分支同步发布 v0.4.5；可在服务器现有项目目录沿用其当前分支拉取。新版 APK、校验文件、账号/公告接口、初始公告模板和强制升级策略随源码一并更新。

## 拉取、构建、重启

先按现有运维方式备份 .env、DATA_DIR 下的数据库与公告、用户上传内容。保留这些文件，不用示例 .env 覆盖原配置。

在服务器现有项目目录执行：

```sh
git pull --ff-only
npm ci --include=dev
npm ci --prefix mobile --include=dev
npm run build
```

构建成功后，用原来的方式重启 Node 服务。若使用 PM2，重启已有服务名称并带上 --update-env；若使用宝塔，在原 Node 项目管理中重启。不要另外启动一个占用相同端口的服务。

必须先构建成功再重启：新版页面、下载文件与后端需要同时生效。构建会把 public/downloads/kaojiang-v0.4.5.apk 复制到 dist/downloads。也可从 GitHub Release 下载已构建服务器更新包，解压合并到现有项目后安装生产依赖并重启。

## 强制升级与数据保留

server/mobile-release.json 定义最新版、最低版均为 0.4.5，以及官网安装包路径 /downloads/kaojiang-v0.4.5.apk。服务端读取该发布策略；保留的旧 MOBILE_* 环境配置不能降低版本要求或恢复旧下载地址，更新时无需更改其他密钥。更高版本的后续环境配置仍可生效。

旧 App 查询更新时返回 forceUpdate=true；使用旧版本访问受保护移动接口返回 HTTP 426 和新版下载地址。v0.4.5 本身及普通官网网页继续使用现有登录流程。安装升级仍沿用现有同包名和正式签名。

账号、学习记录与上传内容保留在原 DATA_DIR。公告首次从模板初始化，以后保存在 DATA_DIR/mobile-announcement.json，不因升级重置；管理员可以在手机端直接修改公告，无需重新构建或安装。

## 线上验收

1. https://aceexam.top/api/mobile/version?version=0.4.4 返回 latestVersion/minimumVersion=0.4.5、forceUpdate=true。
2. https://aceexam.top/api/mobile/version?version=0.4.5 返回 forceUpdate=false。
3. 官网下载页显示 v0.4.5，并提供 /downloads/kaojiang-v0.4.5.apk；文件应为 73,742,723 字节，SHA-256 为 7e02ffb0b8ccc5204280fbd5c5994dcb1ea95dd3dbaf9b12838496fc60aed8b0。
4. /app/version.json 是 JSON，version=0.4.5；/api/mobile/announcement 返回合法公告。
5. 用管理员登录手机端，“我的 → 管理中心”可读取账号和保存公告；普通账号不可访问管理接口。

GitHub 发布不表示服务器已经拉取、构建和重启。只有线上接口和文件核对后，才确认官网新链接与强制更新已生效。真机悬浮窗、锁屏/后台和覆盖安装仍须另行验收。
