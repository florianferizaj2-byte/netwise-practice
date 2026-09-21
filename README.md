# 考匠 AceExam

考匠（AceExam，Ace + Exam）是一个面向职业认证考试的机考练习与模拟平台。用户可以用自己的 AI 配置，根据错题生成针对性变式题；通过审核的题目可以分享给同证书的其他用户，让题库在使用过程中持续增长。

平台采用响应式网页：手机端适合章节练习、错题复习和 AI 变式训练，电脑端更适合限时模拟考试，可使用答题卡、统一交卷和考后逐题复盘。

当前内置：

- 软考中级网络工程师：490 道题
- HCIA-Datacom V2.0：400 道题
- 全国计算机等级考试二级 MS Office：180 道题（33 道大纲练习 + 147 道用户提供未核验汇编）
- 全国执业兽医资格考试（兽医全科类）：已导入 7,888 道可发布题目，另有 2,577 道待核对
- 共 8,958 道内置唯一题目，题库启动时自动校验并同步到 SQLite

## 最近更新 · 2026-09-21

- 发布考匠移动端 v0.1.1（Android APK）。登录、证书选择、今日概览、题库练习和错题复习复用现有后端，移动端使用 Bearer 会话，学习记录按账号保存。
- 网站账号菜单新增“下载 App”，部署后可直接下载 [`kaojiang-v0.1.1.apk`](public/downloads/kaojiang-v0.1.1.apk)。
- 移动端修正日期显示和错题复习来源，支持顺序刷题与随机刷题；提交答案后优先本地展示判题结果，减少反馈等待。
- 网站端更新注册密码确认、登录页动效、证书引导响应式布局和作者 API 配置入口。
- 执兽模拟考试固定从基础、临床、预防、综合四大章节各抽 100 题，共 400 分；每题 1 分，总分达到 240 分及格，不设单科门槛。
- 做题区新增题目异常举报，用户可以选择答案/解析错误、题干/选项表述问题、题目重复或其他异常，并补充说明。
- 管理员面板新增“用户反馈”区域，可以查看反馈详情、直接修改题干/选项/答案/解析/知识点，或取消反馈；修改和取消都会写入操作审计。
- 执兽题库按四大章节继续细分到知识点，题库来源统一由管理员维护，用户反馈可以回流到题目修订流程。

项目使用 React + Vite 构建前端，Node.js + Express 提供服务端，SQLite 保存账号和学习数据。AI 功能为可选项，支持 OpenAI Compatible Chat Completions 接口。

## 核心理念：会增长的共享题库

平台的核心闭环是：

```text
用户做错题
    ↓
AI 分析错误原因和薄弱知识点
    ↓
根据错因生成多道变式题
    ↓
服务端校验、去重和独立质量审核
    ↓
写入用户的 AI 训练组
    ↓
同证书用户选择共享 AI 题继续练习
    ↓
更多作答记录和新错题，继续产生新的题目
```

AI 题不是简单换数字，而是会改变概念辨析、计算方式、反向推理或实际应用场景。每个用户的答题记录、错题、掌握度和复习进度独立保存；共享的是题目内容，不会共享个人学习数据。

8,958 道是随项目分发的内置题目数量，不是平台的最终题量。用户生成并共享的 AI 题会保存在服务端，题目总量可以随着用户使用持续增加。当前 AI 题通过“其他用户生成的 AI 题”入口使用，不会自动冒充官方题目，也不会直接混入内置题库或正式模拟考试题池。

## 功能概览

- 注册、登录和证书选择；不同证书的题库与学习记录相互隔离
- 章节练习、单选题、多选题、判断题和答题解析
- 错题本、到期复习、知识点掌握度和每日学习计划
- 可暂停、刷新并继续的限时模拟考试；执兽模拟考试按四科各 100 题、总分 240 分及格计算
- AI 错因分析、分级提示、变式训练和专项训练
- AI 生成题的结构校验、质量审核、题目去重和 IPv4 数值复核
- 同证书用户之间共享 AI 题，个人作答记录相互隔离
- 共享 AI 题库页面、题目质量反馈、题目异常举报、共享开关和贡献统计
- 管理员面板：独立管理员 AI 配置、按知识点扩充共享题库、高重合题扫描与删除、用户反馈处理、用户封禁和操作审计
- 题库来源、考试大纲、模块覆盖率和题量缺口展示
- 服务端校验答案和考试时间，浏览器不能直接修改题目、答案或解析
- 默认仅绑定本机，并提供 Host、Origin、Cookie 和 API Key 保护

## 快速开始

要求 Node.js 24 或更新版本。

```powershell
npm install
node scripts/setup.js
npm run build
npm start
```

打开 <http://127.0.0.1:5173>，首次访问后注册账号并选择证书。

开发模式会使用 Vite 中间件，支持实时更新：

```powershell
npm run dev
```

`node scripts/setup.js` 会在项目根目录生成被 Git 忽略的 `.env`，并为 AI Key 加密生成随机主密钥。已有 `.env` 不会被覆盖。

## 移动端 App

Android v0.1.1 已接入现有网站 API，支持登录、证书选择、今日学习概览、题库练习、错题复习、顺序刷题和随机刷题。网站部署后，登录账号菜单中的“下载 App”会提供安装包；源码中的 APK 位于 [`public/downloads/kaojiang-v0.1.1.apk`](public/downloads/kaojiang-v0.1.1.apk)。

移动端本地开发和 API 配置见 [`mobile/README.md`](mobile/README.md)。生产 API 默认使用 `https://aceexam.top/api`，不要把账号密码、API Key 或生产数据写入 App 源码。

首次创建的账号会自动成为管理员；已有数据库启动时也会把最早创建的账号补为管理员。若希望明确指定管理员，可在 `.env` 中设置 `ADMIN_USERNAME=你的账号`，重启服务后该账号会获得管理员权限。

## 配置

可以复制 `.env.example` 作为配置参考：

```dotenv
AI_MASTER_KEY=
ADMIN_USERNAME=
PORT=5173
BIND_HOST=127.0.0.1
ALLOWED_HOSTS=127.0.0.1,localhost,::1
TRUST_PROXY=0
COOKIE_SECURE=0
DATA_DIR=./data
```

常用配置：

- `PORT`：监听端口，默认 `5173`
- `BIND_HOST`：监听地址，默认 `127.0.0.1`
- `ALLOWED_HOSTS`：允许访问的 Host，使用逗号分隔
- `DATA_DIR`：SQLite 数据库目录，默认 `./data`
- `COOKIE_SECURE=1`：HTTPS 请求自动启用安全 Cookie；即使误用 HTTP 地址也不会发出浏览器无法保存的 `Secure` Cookie
- `COOKIE_SECURE=0`：强制关闭安全 Cookie，仅建议本机 HTTP 开发使用
- `TRUST_PROXY=1`：Node 位于可信反向代理之后时启用
- `AI_MASTER_KEY`：加密保存用户 AI API Key 的 AES-256-GCM 主密钥
- `ADMIN_USERNAME`：可选，明确指定拥有管理员面板权限的账号；不设置时使用最早创建的账号

不要把 `.env`、`data/`、数据库文件或日志提交到 Git。主密钥丢失后，已保存的 AI API Key 无法解密，只能重新填写。

## AI 设置

登录后进入“设置 → AI 设置”，填写：

- Base URL，例如 `https://your-provider.example/v1`
- API Key
- 模型名称
- Temperature

服务端调用的接口是：

```text
POST {Base URL}/chat/completions
```

远程地址必须使用 HTTPS；本机模型可以使用类似 `http://localhost:11434/v1` 的地址。AI 不可用时，普通练习、错题本、复习和模拟考试仍可正常使用。

API Key 只在服务端解密和调用时短暂存在，不会回传前端，也不会写入日志。用户发起 AI 训练后，系统会结合原题、错误作答、错误原因和掌握度生成变式题。题目先经过 Schema 校验、重复检查、可识别的 IPv4 数值复核和独立质量审核，合格后才进入当前账号的训练组，并标记为“AI 生成练习题”。

通过审核的 AI 题会保留生成者归属，但同一证书的其他用户可以在章节练习中打开共享 AI 题。共享接口不返回原作者、训练组、答案或解析；其他用户作答后由服务端判分，自己的错题、复习排期和掌握度独立计算。

## 管理员面板

管理员登录后，侧边栏会出现“管理员面板”。管理员 AI 配置与普通用户的 AI 配置分开加密保存，只有管理员扩题时使用，不会成为其他账号的默认 Key。面板支持：

- 选择证书、章节和知识点，一次生成 1—20 道题并写入该证书的共享题库；题目经过 Schema 校验、去重和独立审核后才入库
- 按题干和选项扫描同证书、同章节的高重合题，确认后删除；内置题删除会记录持久化删除标记，重启不会自动恢复
- 查看用户、封禁/解封普通账号；封禁会立即撤销其登录会话，管理员账号不能互相封禁
- 查看“用户反馈”区域，定位用户举报的题目；管理员可以修改题目或取消反馈，操作会记录到审计列表
- 查看管理员配置、扩题、删题、封禁等操作审计记录

## 共享 AI 题库

登录后可以进入“共享题库”查看同证书用户贡献的 AI 题，按章节和反馈排序后开始练习。AI 题组默认可以共享，也可以在“AI 专项训练 → 我的 AI 题组”中切换为“仅自己使用”。

练习题目时可以提交“答案或解析有误”“题干或选项表述有问题”“题目重复”或“其他异常”。反馈按用户和题目去重保存，管理员会在反馈区域中处理；反馈不会公开账号、API Key 或个人学习记录。

共享题目前不会自动进入内置题库或正式模拟考试，而是通过独立入口逐步积累。这样可以让社区题量持续增长，同时保持内置题和认证考试范围的来源边界清晰。

## 题库

题库位于 `server/question-banks/`，按证书目录组织：

```text
server/question-banks/
├─ hcia-datacom/
│  ├─ manifest.json
│  ├─ guide.json
│  ├─ questions/
│  └─ reports/
├─ network-engineer/
│  ├─ manifest.json
│  ├─ guide.json
│  ├─ questions/
│  └─ reports/
├─ ncre-ms-office/
   ├─ manifest.json
   ├─ guide.json
   ├─ questions/
   └─ reports/
└─ veterinary-practitioner/
   ├─ manifest.json
   ├─ questions/
   └─ reports/
```

每个证书通过 `manifest.json` 声明证书信息、题库分组、来源和考试大纲。服务启动时会自动发现题库，不需要修改路由、数据库或前端证书列表。

HCIA-Datacom V2.0 包含 22 个大纲模块。模块权重用于本站模拟考试和练习抽题，不代表华为官方考试占比。题库中的用户提供回忆题和模拟题均明确标注为第三方内容，不宣称是华为官方真题。

二级 MS Office 题库依据中国教育考试网 2025 年版考试大纲整理，范围拆为 Office 应用基础、Word、Excel、PowerPoint 和公共基础知识五部分，其中公共基础知识按选择题 10 分单独标记。用户提供的 DOCX 题目保留原文的“真题/模拟题”标记，但因缺少官方题号、年份和可核验链接，平台统一按未核验汇编处理。

修改或新增题库后运行：

```powershell
npm run bank:validate
npm test
```

完整的清单格式、题目 Schema 和扩展示例见 [`server/question-banks/README.md`](server/question-banks/README.md)。

给后续 AI 使用的完整扩展流程见 [`docs/AI-QUESTION-BANK-OPERATIONS.md`](docs/AI-QUESTION-BANK-OPERATIONS.md)。任何新增证书、导入题目或扩展题库的操作，都应先阅读该文档。

## 从原始资料导入

软考汇编导入器需要安装包含 `python-docx` 的 Python 环境：

```powershell
python scripts/import_docx_bank.py "原文档目录"
```

导入器会检查题号连续性、选项、答案和解析；遇到无法安全解析的图片、公式、表格或格式时会停止，避免静默漏题。原始文档不会被修改，导入报告会保留来源文件、题号、重复记录和待核对记录。

HCIA 题库相关脚本：

```powershell
npm run bank:hcia
npm run bank:hcia:supplement
npm run bank:hcia:import-h12-811
```

## 部署

生产构建和启动：

```powershell
npm install
npm run build
npm prune --omit=dev
npm start
```

生产环境建议使用 Nginx 或 Caddy 终止 HTTPS，并将 `/` 和 `/api/` 转发到 Node 服务。例如：

```bash
PORT=5173
BIND_HOST=127.0.0.1
ALLOWED_HOSTS=learn.example.com
TRUST_PROXY=1
COOKIE_SECURE=1
DATA_DIR=/var/lib/aceexam
AI_MASTER_KEY='<随机的 32 字节 base64 密钥>'
npm start
```

部署时必须同时携带：

- `dist/`：前端构建产物
- `server/`：服务端代码和内置题库
- `data/` 或指定的 `DATA_DIR`：SQLite 数据库
- `.env`：运行配置和 AI 主密钥

数据库保存账号、答题记录、错题、掌握度、复习队列、考试会话、AI 题组和调用用量。备份前先停止服务，同时备份数据库目录和 `.env`，并将 `.env` 作为敏感凭证单独保管。

## 验证

```powershell
npm run bank:validate
npm test
npm run build
npm run test:e2e
```

当前验证结果：

- 内置题库校验通过：8,958 道唯一题目
- 自动化测试：27 项通过
- 端到端测试使用临时数据库和确定性 AI 测试桩，不会修改个人学习记录或消耗真实 API 额度

Windows 端到端测试使用已安装的 Microsoft Edge；其他平台如缺少浏览器，可先运行：

```powershell
npx playwright install chromium
```

## 项目结构

```text
src/                         React 页面和响应式样式
server/index.js              HTTP API、认证、每日任务和前端服务
server/domain.js             题目校验、IPv4 计算、掌握度和复习间隔
server/ai.js                 OpenAI Compatible Provider、AI 训练和审核
server/security.js           加密、地址校验和日志脱敏
server/store.js              SQLite 持久化
server/question-banks/       证书题库、清单、指南和导入报告
scripts/                     初始化、题库构建和校验脚本
test/                        领域、接口、安全和浏览器流程测试
```

## 内容边界

这是一个小规模、用户参与扩充的学习应用，不是官方考试系统。内置原创题、仿真题、用户提供资料和 AI 生成题应以页面标注为准；共享 AI 题也不代表官方真题，AI 内容不能保证完全无误。正式考试信息、报名时间和考试规则请以对应认证机构的最新公告为准。
