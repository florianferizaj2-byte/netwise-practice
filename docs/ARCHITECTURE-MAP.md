# 考匠 AceExam 架构与维护地图

> 本文件是给后续 AI 编程代理和站点维护者使用的**导览**，只描述现状与约定，不重复业务规则。
> 题库扩展的强制规范在 [AI-QUESTION-BANK-OPERATIONS.md](AI-QUESTION-BANK-OPERATIONS.md)，两者配合阅读。
> 记录时间：2026-10-08。仓库处于分支 `desktop-workspace-downloads`。

## 1. 技术栈与入口

| 层 | 技术 | 入口 |
| --- | --- | --- |
| 电脑网页 | React 19 + Vite 7 + lucide-react，无路由库（纯 hash） | `src/main.jsx` |
| 服务端 | Node 24 + Express 5 + `node:sqlite`（`DatabaseSync`）+ zod 4，ESM，无 TypeScript | `server/index.js` |
| Android App | Expo / React Native | `mobile/` |
| iPhone / iPad 网页 | **与 Android 同一套** RN 源码，`expo export --platform web` 输出到 `/app/` | `scripts/build-mobile-web.mjs` |
| 微信小程序 | 原生小程序，Bearer 复用同一后端 | `miniprogram/` |
| 内置题库 | 证书目录 + JSON，服务启动时自动发现并同步进 SQLite | `server/question-banks/` |
| 持久数据 | `data/netwise.sqlite`（WAL）+ `data/community/uploads` | 由 `DATA_DIR` 决定 |

环境要求：Node 24 及以上（依赖 `node:sqlite` 与 Express 5 的路径语法）。

## 2. 服务端要点

### 启动与中间件顺序（`server/index.js`）

唯一工厂是 `createApp(options)`（`server/index.js:147`）。顺序**不可随意调整**：

1. `express.json({ limit: "12mb" })` — 社区图片走 base64，所以限制很大。
2. `/api` 守卫：`ALLOWED_HOSTS` 校验、`Origin` 必须同源、拒绝 `sec-fetch-site: cross-site`。这是本项目**替代 CSRF token 的防线**。
3. `route(method, url, fn)` 辅助函数（`server/index.js:192`）——返回值统一 `res.json()`。**它不能用于流式响应**，SSE 端点必须用裸 `app.post`。
4. **游客体验路由注册在鉴权中间件之前**（`server/index.js:432`）。不能下移；反向也不能把需鉴权的路由上移。
5. 鉴权中间件（`server/index.js:433`）：无会话 401、被封禁 403。
6. 静态：`/app` 挂 `dist/app`（`_expo/`、`assets/` 一年不可变，其余 `no-cache`）、`/question-images`、生产环境 `dist` + SPA 回退。

### 路由总览

所有路由注册在**同一个扁平命名空间**，子模块通过注入 `route` 挂载：

- `server/index.js` — 认证、社区、会员权益、设置、管理面板、题目、练习、错题、收藏、考试队列、AI 分组与生成
- `server/exams.js` — `/api/exams*`（乐观锁交卷，`EXAM_ANSWERS_CONFLICT`）
- `server/guest-trial.js` — `/api/guest-trial*`（匿名体验，**免登录**）
- `server/membership-routes.js` — `/api/account/redeem`、`/api/admin/membership-codes*`
- `server/study-routes.js` — `/api/study/*`（VIP 主观题）与 `/api/admin/study/*`

### 数据与存储约定（`server/store.js`）

- **没有版本化迁移机制**：全靠 `CREATE TABLE IF NOT EXISTS` + 裸 `ALTER TABLE ... ADD COLUMN` 包在空 `catch` 里 + 定向修表。新增字段请沿用这一风格，不要引入迁移框架。
- **绝大多数表是「JSON blob 存 TEXT」**（`questions.data`、`sessions.data`、`ai_groups.metadata` 等）。**例外**：`user_entitlements`、`user_daily_ai_credits` 是类型化列 —— 额度与会员计账刻意做成关系表。
- `allQ()` 把整张题目表 memo 在内存里。**任何写 `questions` 的新路径都必须调用 `invalidateQuestions()`**，否则读到的是过期缓存。
- 题库启动同步（`server/store.js:437`）：按题目 ID 比对 `JSON.stringify`，不同才更新。
- **`question_tombstones` 让删除永久生效**：管理员删掉的内置题不会在重启后复活。要把题加回来必须手动删掉 tombstone 行。

### 认证

- 密码：`scrypt`（16 字节 salt、64 字节 hash）。未知账号也用随机 salt 做同样开销的哈希，防账号枚举与时序攻击。
- 会话：返回 32 字节随机 token，**库里只存 sha256**，30 天有效。
- 网页用 Cookie（`netwise_session`，httpOnly + SameSite=Lax）；`sessionToken` 只对带 `x-client: mobile|miniprogram` 的请求返回。
- 封禁会立即删除该用户全部会话。
- 登录/注册频率限制是**基于 SQLite 的固定窗口计数器**（`server/auth-rate-limit.js`），可跨重启；`TRUST_PROXY=1` 时 `req.ip` 才可信。

### 密钥与日志

- AES-256-GCM 加密存储数据库里的 AI Key，主密钥来自 `AI_MASTER_KEY`（必须 32 字节 base64）。
- `redact()` 是唯一被认可的打日志前脱敏手段；用 `safeLog`，不要直接 `console.log` 请求体。
- `validateBaseUrl()` 要求 HTTPS（仅 localhost 例外），禁止带凭据/query/hash —— 这是可配置 Base URL 的 SSRF 防线。

### AI 层

- 凭据优先级：环境变量 `AI_SERVICE_*` → 兼容 `AUTHOR_API_*` → 数据库加密配置。环境变量里的 Key 是**明文**，只有数据库里的才加密。
- 任务调度（`server/ai-tasks.js`）：单账号串行（第二个任务 409）、全局并发默认 3、队列 40、任务超时 180s、排队等待 30s 后 503。
- 通过 `AsyncLocalStorage` 传递取消信号。**新增 AI 调用点必须在 await 边界调用 `checkAiCancellation()`**，否则该任务无法被取消。
- 生成题要过四关：严格 Schema → 查重（相似度 ≥ 0.9 拒收）→ IPv4 程序化复核（与 AI 答案不一致直接抛错）→ 第二次独立 AI 审核。
- AI 题权限靠 `requireQ` 每次回查 `ai_groups`（`server/index.js:702`）。**不要简化成只判断 `ownerUserId`**，它是唯一的跨账号隔离点。

### 额度与兑换

- 会员 30 天一期：vip 100 / svip 300 / ssvip 600 次生成。先扣每日签到免费额度，再扣会员额度，不足返回 429。
- 退款按「预留 ID」幂等（`refunded_at IS NULL` 守卫）。**扣费与退款必须使用同一个 `day` / `membershipId`**，跨上海零点或跨期退款会退到旧桶。
- 兑换码生成按 `request_key` 幂等。**客户端重试必须复用同一个 `requestId`**，否则会生成两批码。
- 已兑换的码不能作废撤回。
- 兑换频率限制是**进程内 Map**，重启即失效、多进程不共享。

### VIP 主观题（精讲与练习）

- 节点版本号 = 内容哈希。**改 taxonomy 或 `study-seeds/*.json` 会让已发布课时与排队任务全部失效**，这是刻意耦合。
- 用户可见题目必须过 `publicStudyQuestion()`（剥离答案/别名/容差/解析）。
- 判分先走确定性规则（仅字面相等得分），AI 只能决定 `uncertain` 的空；服务端会重新推导并逐字段合并，防止适配器越权。
- 出题人答疑：每档每日 20/40/80 次，按 `(user_id, request_id)` 幂等预留。

## 3. 电脑网页要点（`src/`）

- **没有路由库**：`page` 状态与 `location.hash` 双向同步。`/#downloads` 免登录，`#welcome` 是品牌首页。
- **桌面/移动的分流判据是 JS，不是媒体查询**：`matchMedia("(min-width: 900px) and (hover: hover) and (pointer: fine)")` 再加 UA 与 `kaojiangAppleMobile` 排除（`src/desktop-experience.jsx:27`）。
- 两套根类名：`.desktop-experience`（营销/下载/试做）与 `.desk-workspace`（登录后工作台）。**桌面选择器必须以这两个类为前缀，绝不污染移动样式。**
- 类名前缀：桌面 `desk-`、工作台 `study-`、下载页 `download-`。颜色/圆角/阴影只用 `src/theme.css` 的令牌。
- 17 个功能页全部 `React.lazy` + `FeatureBoundary`（Suspense + 错误兜底）。图标只用 `lucide-react`，不自造 SVG。
- API 客户端是 Cookie 同源请求，超时 30s（`/ai/*` 为 210s）；401 在父层 `run()` 统一处理成「登录已失效」。
- `streamApi` 是手写 SSE 解析，只有 `/ai/train/stream` 在用。
- 本地持久化按「账号 + 证书」隔离：练习 `kaojjiang-practice:*`、考试 `kaojing-exam-v2:*`（乐观锁冲突绝不自动覆盖）、主观题草稿 `aceexam-study-*`。
- 页面级 CSS 由懒加载组件自行 `import`，注入时机偏晚（`src/theme.css:47` 记录了踩过的坑）。跨页面共享的样式不要放进某个页面专属 CSS。

### 新增一个电脑端页面的清单

1. 建 `src/features/<kebab-name>.jsx`，导出具名组件。
2. 在 `src/main.jsx` 用 `lazy(() => import(...).then((m) => ({ default: m.X })))` 注册，**不要新增静态 import**。
3. 在 `navs` 注册 `[id, 中文标签, Icon]`，并放进对应的导航分组。
4. 在 `<main>` 中按 `{page === "x" && <X ... />}` 添加分支；标题兜底对象有电脑端与移动端两处，都要补。
5. 样式加到 `desktop.css` / `workspace.css`（或以 `.desktop-experience` / `.desk-workspace` 为前缀），颜色用 `theme.css` 令牌。
6. 数据访问走 `api()`；AI 生成类用 `streamApi`。

## 4. 手机端与小程序

- `mobile/` 用**文件名后缀**做平台拆分（`*.web.tsx` / `*.web.ts`），原生文件通常只是空实现。
- 唯一的运行时开关是 `isAppleWeb`（`mobile/src/theme.ts:79`），用它切换 Apple 配色/间距/圆角。**不要在页面里直接写 `Platform.OS` 判断样式。**
- 认证是 Bearer 存 AsyncStorage（`kaojiang-session-token`），会话作用域的资源缓存**不保存答案、解析、私密 AI 数据**。
- `scripts/build-mobile-web.mjs` 强制 `EXPO_NO_DOTENV=1` 和空 API 地址，保证发布版永远用同源 `/api`；同时生成内容哈希 `buildId` 写进 `sw.js` 与 `dist/app/version.json`。
- 小程序 8 个页面，API 地址目前**硬编码** `https://aceexam.top/api`（`miniprogram/app.js:5`）。`project.config.json` 的 `appid` 需要换成正式 AppID；服务端要配 `WECHAT_MINIPROGRAM_APP_ID/SECRET`。
- 小程序**没有自动化测试覆盖**。

## 5. 构建、测试与发布

`npm run verify` 是串行 fail-fast 的 9 步（`scripts/verify.mjs`）：

1. `npm run bank:validate` — 题库结构与计数
2. `npm run typecheck` — 手机端 TypeScript
3. `npm test` — `node --test test/*.test.js`（当前 120 项）
4. `npm run build` — 电脑网页 + 移动网页
5. `test/e2e.js` — 电脑端完整流程
6. `test/subjective-study.e2e.js` — VIP 主观题流程
7. `test/mobile-web.e2e.js` — 移动网页双浏览器
8. `test/apple-ui.e2e.js` — 苹果网页布局与无障碍
9. `test/mobile-study.e2e.js` — 移动端 AI 精炼

单独运行：

```powershell
npm run bank:validate      # 题库结构检查
npm run bank:report        # 题库覆盖缺口报表（只读，见第 7 节）
npm run typecheck          # 手机端类型检查
npm test                   # 单元与接口测试
npm run build              # 电脑 + 移动网页构建
npm run test:e2e           # 电脑端浏览器流程
npm run test:e2e:mobile    # 移动网页流程
npm run test:e2e:apple-ui  # 苹果网页布局
```

注意事项：

- `test/mobile.e2e.js` **没有 npm 脚本**，也没有进 `verify`，属于手动测试（固定端口 5186，需要先自行 `expo export`）。
- `test/browser-fixture.js` 固定占用端口 5174，`test/mobile.e2e.js` 固定 5186。
- 测试全部用 `mkdtempSync` + `createStore(dir)` + `listen(0)` 隔离数据库，AI 通过注入 `provider.fetch` 打桩，不消耗真实额度。
- CI 用 Node 24 + Chromium + WebKit，20 分钟上限，只在失败时上传截图（`.github/workflows/verify.yml`）。
- `npm run package:release` 是发布闸门，不是构建：会校版本号、要求干净工作树、校验 APK 哈希、执行路径白名单与私密文件黑名单、并复验 tar 与文件清单一致。
- **在 Windows 沙箱（受限文件权限）下，`npm test` 与 `npm run build` 会因禁止命名管道而报 `spawn EPERM`**（Node 测试运行器与 esbuild 都需要带管道的子进程）。这不是项目缺陷；拿到完整权限后即可正常运行。

## 6. 改动时最容易踩的坑

1. **Schema 严格**：`questionSchema` 与 options-as-object 都是 `.strict()`。给题目加字段要同时改 Schema、`publicQuestion` / `privateQuestion` 和两端客户端。
2. **题库章节名必须精确匹配**：有 `syllabus` 时 `chapter` 必须等于模块 `name`；有 `taxonomy` 时还要匹配 `chapter / knowledgeSection / knowledgePoint` 三级路径。不一致会让**服务启动直接失败**。
3. **权重必须合计 100**，`targetQuestionCount` 必须为正整数。
4. **题目 ID 全局唯一**：跨证书复用 ID 时内容必须完全一致，否则启动失败。新增前先全仓搜索。
5. **`route()` 不能流式**：新的 SSE 端点要用裸 `app.*`，并在 `res.headersSent` 时不要重复发头。
6. **`/app` 的缓存头是手写的**：新增非哈希命名的顶层资源目录时要同步扩前缀判断，否则会被缓存一年。
7. **游客体验的 5 道题是硬编码题目 ID**（`server/guest-trial.js:10`，`practice-1/2/5/7/10`）。重构网络工程师题库 ID 会连带影响这里。
8. **不要用定时任务生成学习计划**：会擅自消耗用户额度（`server/index.js:2672` 有明确注释）。

## 7. 题库覆盖现状（`npm run bank:report`）

唯一内置题目合计 **9,750** 道。

| 证书 | 题量 | 大纲模块缺口 |
| --- | --- | --- |
| 软考中级网络工程师 | 1,182 | 未配置 syllabus |
| HCIA-Datacom V2.0 | 400 | 0（22 个模块均达标） |
| NCRE 二级 MS Office | 180 | 3（PowerPoint 演示文稿） |
| 全国执业兽医（全科类） | 7,888 | 0（四科均达标） |
| 四川专升本 · 计算机 | 145 | **155** |

四川专升本按考纲目标仍缺 155 道，是当前最明确的扩题方向；其中「办公自动化」缺 64 道、「计算机软硬件基础」缺 40 道。

题型分布偏单选，多选尤其稀少（网络工程师 1,182 道里只有 1 道多选、执业兽医 7,888 道里只有 2 道多选）。扩题时值得优先补多选与判断。

## 8. 本地启动

```powershell
npm install
npm ci --prefix mobile
node scripts/setup.js     # 生成 .env 与 AI_MASTER_KEY（已存在则不覆盖）
npm run build
npm start                 # 生产模式，默认 http://127.0.0.1:5173
```

开发模式用 `npm run dev`（Vite 中间件，热更新）。首次注册的账号自动成为管理员；也可用 `ADMIN_USERNAME` 指定。

`.env`、`data/`、`*.sqlite`、日志与压缩包都不得提交 Git。
