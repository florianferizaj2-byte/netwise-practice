# Android 正式签名

`app.json` 中的 `withReleaseSigning` 插件在 Expo 生成 Android 工程时应用正式签名配置；正式构建缺少配置时会中止。

本机证书与密码配置保存在仓库之外：

```text
%LOCALAPPDATA%\AceExam\AndroidSigning\kaojiang-release.keystore
%LOCALAPPDATA%\AceExam\AndroidSigning\release-signing.properties
```

请将这两个文件一起备份到受保护的位置。以后更新必须继续使用同一证书。不要公开或提交证书与密码配置。

其他构建环境通过 `ACEEXAM_RELEASE_SIGNING_PROPERTIES` 指向自己的 UTF-8 配置文件，包含 `storeFile`、`storePassword`、`keyAlias`、`keyPassword`，可选 `storeType`（默认 JKS）。`storeFile` 使用绝对路径和正斜杠。

## 应用身份

- 包名：`com.kaojiang.app`
- 正式证书 MD5：`b0c2fa775c8e8cee2c3e2c4b0d771cba`
- 正式证书 SHA-1：`420d6f96eeac138a2faabb771934bea8dcaf46e0`
- 正式证书 SHA-256：`986e4d8a00ce694362b2ac7883588e2775d3259201900c92b88978e797957a3b`

微信开放平台的应用资料应使用正式 APK 对应的信息。如使用微信开发者工具生成 Android 签名和公钥，请选择本次正式签名 APK。

原 Debug 签名安装包无法直接覆盖安装此正式签名包。卸载旧 App 后安装会清除手机本地数据，服务器数据库不受 APK 签名更换影响。
