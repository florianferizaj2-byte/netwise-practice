# 刷题语音包 API（voice-packs-v1）

## 当前交付范围

Web 蓝色管理员端已提供「用户与运营 → 语音包管理」（`#admin/voice-packs`），可批量导入、分组检索、试听、标记审核、编排场景、保存独立草稿、发布/下架及设置默认包。后端接口支持这些操作。App 源码提供了类型、读取方法以及入场/答对/连对事件选音器；v1.0.5 Android 已支持用户主动下载、完整性校验、选择与离线播放；v1.0.4 仍仅使用内置提示音。

素材未发布时，用户端列表为空、默认包为 null。源音频由管理员从本地选择导入，不会自动读取用户电脑文件夹，也不发起付费语音生成请求。配套 APK 和后台源码仍需由维护者发布/部署，手机实际听感与覆盖安装另行验收。

## 事件协议

| 事件 | 用途 | 选音规则 |
| --- | --- | --- |
| `practice.enter` | 进入一轮刷题 | 从此事件已配置的素材中选一个 |
| `answer.correct` | 本次作答正确 | 使用普通答对素材 |
| `answer.streak` | 本轮连续答对 | 精确匹配次数；未配置该次数时回退普通答对素材 |

建议预留连对 `2 / 3 / 5 / 10` 次，可配置 `2–1000` 的任意整数，每包最多 20 个不同里程碑。例如 3 连对的录音不会在 4 连对时冒充“4 连对”重复使用。每个事件或里程碑最多 8 段素材，可选不同录音避免单调。

App 选音器：`mobile/src/api/voicePacks.ts`。`createPracticeVoiceSession()` 用于按账号/证书/刷题轮次隔离状态；`enter(scope)` 开始新一轮，`answer(clientAttemptId, correct)` 只处理新作答、答错清零，重试同一编号不加连对。历史答案、后台同步回执和考试过程不应调用它。

`selectVoiceClip(manifest, cue, random)` 返回对应素材或 null；null 表示保留内置提示音。`voiceAssetUrl()` 只接受此服务生成的内容地址，拒绝外部地址。

## App 读取接口

需要原有 Bearer 会话或浏览器会话：

- `GET /api/voice-packs`：返回 `revision`、`defaultPackId`、已发布语音包摘要和 `contract`（事件、格式、大小上限与兜底策略）。
- `GET /api/voice-packs/:id/manifest`：返回已发布包的 `schemaVersion`、`id/name/revision`、`cues`、`playback`、`assets`。未发布/不存在返回 404。
- `GET /voice-packs/assets/:sha256`：只读音频地址，仅对已发布语音包引用的素材开放。支持 Range、正确 Content-Type、nosniff 和不可变缓存。**发布后的素材是公开资源**。

清单中的每个素材包含 `id/sha256/url/bytes/mimeType/format/durationMs`。下载后校验大小与 SHA-256；后台预载后再进入刷题，不要每答一道题请求服务器或等待音频下载。保留音量/静音设置，进入后台或切题时取消迟到播放。

`durationMs` 对可解析的 WAV 给出实际时长，其他容器返回 null；容器头识别不等于已经验证每种编码可在每台手机解码。`playback.maxDurationMs` 默认 2500（范围 200–10000），`minIntervalMs` 默认 150（范围 0–5000），供客户端限制播放时长、避免叠音。

App 调用方法已预留：`mobileApi.voicePacks()` 和 `mobileApi.voicePackManifest(id)`。旧后端返回 404/没有 `voice-packs-v1` 能力时应保留内置音效，不能阻塞判题或按次调用 AI。

## 管理员接口

沿用现有管理员会话，普通用户访问返回 403。修改配置使用 `requestId`（UUID）和 `expectedRevision`；同一管理员重试同一请求返回原结果并标记 `replayed:true`，复用编号改内容或旧版本覆盖返回 409。每次成功修改只写一条审计记录。

| 方法与路径 | 功能 |
| --- | --- |
| `GET /api/admin/voice-packs` | 读取 `configuration`、`packs`（当前发布/下架版本）、独立 `drafts` 和素材元数据 |
| `POST /api/admin/voice-packs/assets?name=...&collection=...&durationMs=...` | 原始音频字节；分组与浏览器识别时长可选，不是 multipart/Base64 |
| `PATCH /api/admin/voice-packs/assets` | 批量修改显示名、分组、标签与审核状态 |
| `GET /api/admin/voice-packs/assets/:sha256` | 管理员预览尚未发布的素材，不公开缓存 |
| `PUT /api/admin/voice-packs/:id/draft` | 保存独立草稿，不更改当前发布版 |
| `POST /api/admin/voice-packs/:id/publish` | 将指定草稿版本发布；成功后移除该草稿 |
| `PUT /api/admin/voice-packs/:id` | 兼容原配置接口；`enabled:true` 发布，`false` 下架；不删除原素材 |
| `PUT /api/admin/voice-packs/default` | 设置默认包，或 `packId:null` 恢复内置音效 |

新建包 `expectedRevision:0`，更新时使用包当前 `revision`。默认包操作使用全局 `configuration.revision`，只允许选已发布包。下架当前默认包会同步清除默认指向，公开清单及未被其他已发布包引用的音频返回 404；管理员仍可预览。已经缓存到设备的公开音频无法通过下架从设备中收回。

### Web 操作与审核

1. 从「导入文件夹」选择音效目录，自动以顶层目录名分组；也可多选/拖入文件。每批最多 200 个、并行 2 个，列表逐文件显示新增、复用、失败或取消。停止仅取消剩余工作：在途请求可能已入库，重试通过 SHA-256 复用，原始文件不改动。
2. 按名称/标签/分组/审核状态或 3 秒以内短音筛选，逐条试听后再标记「已试听」。支持当前页与最多 100 条筛选结果的批量分组、标签和审核。显示名可改，原文件字节不可覆盖。
3. 新建包，在「进入刷题」「普通答对」「连对 2/3/5/10 次」或自定义里程碑中选择素材；模拟器可验证进入、连对和答错清零。试听使用单一播放器，不自动播放，切出页面/进入后台停止。
4. 先保存草稿，再发布。已发布包的后续草稿与线上版本相互独立，不因保存而下架；多管理员发生版本冲突时显式重新载入，必要时以最新发布版重新编排。下架不删除素材。

管理员素材字段新增 `revision/collection/tags/state/durationMs/usedBy`。状态为 `pending`（待试听）、`ready`（已试听）、`disabled`（停用）。只有 `ready` 素材才能发布，兼容 PUT 接口同样检查；已发布包仍在引用时，禁止改成待试听/停用。老数据升级时，已发布包引用的素材保持 ready，其余 pending，不改变原发布状态。

批量编辑体示例（每项使用素材自己的 revision；任一项失败整批回滚）：

```json
{"requestId":"<新UUID>","items":[{"id":"<素材SHA256>","expectedRevision":0,"name":"答对鼓励","collection":"卢音盒音效","tags":["鼓励"],"state":"ready"}]}
```

保存草稿体为 `requestId/expectedRevision/basedOnRevision/name/cues/playback`。`expectedRevision` 是草稿版本（首次 0），`basedOnRevision` 是其基于的当前发布版本（首次 0）。发布体为 `{"requestId":"<新UUID>","expectedRevision":<当前发布revision>,"draftRevision":<已保存草稿revision>}`。两处都校验版本与幂等请求号，不静默覆盖别人的修改。

非 WAV 的管理员时长来自浏览器识别值，仅作管理参考；WAV 以服务端文件头时长为准，用户清单协议不变。当前提供播放限长（2.5/5/10 秒），不修改原素材、不实现波形裁剪或响度归一化。试听解码成功不等于所有手机已验收。

### 上传示例（在部署后执行；以下命令未执行）

```bash
BASE=https://aceexam.top
TOKEN='<管理员 Bearer 会话>'
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/voice-packs"
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/octet-stream' \
  --data-binary @correct.wav "$BASE/api/admin/voice-packs/assets?name=correct.wav"
```

先用上传响应的 `asset.id` 和 `asset.revision` 调用 PATCH，将已实际试听过的素材标记为 `ready`。再将下面的 `<素材SHA256>` 替换为该值；每次新修改使用新的 UUID。示例内容可保存为 `voice-pack.json`：

```json
{
  "requestId": "<新UUID>",
  "expectedRevision": 0,
  "name": "我的刷题语音包",
  "enabled": true,
  "cues": {
    "practice.enter": ["<入场素材SHA256>"],
    "answer.correct": ["<答对素材SHA256>"],
    "answer.streak": [
      {"count": 2, "clips": ["<连对2次素材SHA256>"]},
      {"count": 3, "clips": ["<连对3次素材SHA256>"]},
      {"count": 5, "clips": ["<连对5次素材SHA256>"]},
      {"count": 10, "clips": ["<连对10次素材SHA256>"]}
    ]
  },
  "playback": {"maxDurationMs": 2500, "minIntervalMs": 150}
}
```

```bash
curl -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data-binary @voice-pack.json "$BASE/api/admin/voice-packs/my-voice-pack"
```

再 GET 管理员接口取得最新全局 revision，用 `{"requestId":"<新UUID>","expectedRevision":<全局revision>,"packId":"my-voice-pack"}` PUT 到 `/api/admin/voice-packs/default`。客户端读取接口即可得到默认包及完整素材映射。

## 存储与限制

- 素材在现有 `DATA_DIR/voice-packs/assets/`，配置/引用/修订和幂等记录在现有 SQLite 数据库。部署和备份必须同时保留它们，不要清空用户数据目录。
- 无需新增 AI 密钥、录音权限或收费接口；读取语音包、上传和配置不扣用户 AI 积分。
- 格式识别来自实际文件头，支持 WAV、MP3、AAC/M4A、OGG、FLAC；不接受外部下载 URL、HTML 或仅修改后缀的文件。
- 单文件最多 4 MiB，每包最多 32 个不同素材/20 MiB，全站上限 100 个包（发布版与独立草稿按包 ID 去重）、1000 个素材、256 MiB；同样内容重复上传复用 SHA-256 素材。
- 音频不可原地覆盖，修改内容得到新 SHA-256；发布时校验引用素材确实存在且哈希一致。文件与数据库写入失败会回滚当前新增素材，避免虚报上传成功。
- API 后端能力为可选 `voice-packs-v1`；API revision 仍为 1。GitHub 推送不代表线上部署或语音播放已验收。

## 本地验证

先 `npm run build`，再 `npm run test:e2e:voice-library`。此命令使用隔离测试账号、数据库和本地 HTTP，导入合成 WAV 并实际解码，不读取生产数据。可设置 `VOICE_LIBRARY_REAL_DIRS` 为音频目录绝对路径的 JSON 数组，额外验证真实目录导入，并校验源文件哈希不变；`VOICE_LIBRARY_CASE_DIR` 指定本地测试输出目录。真实素材不复制到代码仓库。

## Android 用户下载与播放

v1.0.5 在设置中主动下载整包、校验大小和 SHA-256，完成后写入本地清单并允许启用。文件按 SHA-256 去重保存在应用私有持久目录；本地总量上限 128 MiB，可删除不常用包，仍被其他已下载包引用的音频保留。下载失败/取消不会伪装成完整包；重试复用已校验文件。更新包在完整下载前不替换旧清单。

选择包后，播放资源在作答路径之外解码准备。入场/答对/连对事件只查内存和本地文件，不发网络请求、不延迟判题；离线时自选的已下载包可使用，没有已下载默认包时保留内置提示音。后台默认变更不会强迫用户自动下载；用户可以跟随后台默认、固定自选包或只使用内置音效。下架无法撤回已下载的公开音频。
