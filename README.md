# 网知 NETWISE

网络认证刷题网站。React + Express + SQLite，支持软考中级网络工程师与 HCIA-Datacom V2.0，并可连接用户自选的 OpenAI Compatible Chat Completions 服务。服务器内置 506 道软考题和 400 道 HCIA-Datacom 题，共 906 道题。不同证书的题库、考点和学习记录按证书隔离。

## HCIA-Datacom V2.0

HCIA 的 22 个考点模块来自[华为人才在线 V2.0 模拟考试介绍](https://talent.shixizhi.huawei.com/iexam/1365189427395223554/examInfo?examId=2005554441662554114&sxz-lang=zh_CN)，包括网络参考模型、华为网络设备操作系统、以太网与 VLAN、生成树、链路聚合、IPv4/IPv6、路由与 OSPF、ACL、AAA、网络服务、NAT、数据中心、WLAN、设备管理、网络自动化、故障排除和园区组网。网站显示当前版本、考试代码、来源链接、模块覆盖率和题量缺口；模拟考试按本站练习权重分层抽题。练习权重用于均衡本站题目，不表示华为官方考试占比。

HCIA 题库包含 220 道依据官方公开范围原创编写的大纲仿真题，22 个模块各 10 道，保存在 `server/question-banks/hcia-datacom/questions/syllabus-practice/`；另有用户提供的 H12-811 题库，已按当前 22 个考点重新归类为 89 道第三方公开回忆题和 91 道第三方原创模拟题。后两类均明确标注为非华为官方真题，并保留原题号、来源链接、5 条答案争议备注及导入修正记录，见 `server/question-banks/hcia-datacom/reports/h12-811-user-provided.json`。华为人才在线的[官方 V2.0 在线模拟考试入口](https://talent.shixizhi.huawei.com/iexam/1365189427395223554/examInfo?examId=2005554441662554114&sxz-lang=zh_CN)已在首页展示。未发现华为官方公开、可转载的完整历年真题库；以后取得可验证来源的公开样题或真题时，应新建独立题库分组并保留来源 URL、验证状态和版本。

## 导入的软考汇编题库

11 份 Word 文档共 550 条题目，合并 90 条完全重复记录后保留 459 道可练习题，另有 1 道待核对题不发布。重复题的原题号、来源文件和不同解析均保存在导入记录中。第一章第 50 题要求选择错误说法，但原答案 D 与解析均称 OSI 模型出现较晚，答案不成立，因此暂不进入练习。

- `server/question-banks/network-engineer/questions/user-collection/`：按章节拆分的题目、选项、原答案、原解析、知识点与来源信息。
- `server/question-banks/network-engineer/reports/user-collection.json`：逐文件 SHA-256、原题数量、重复记录和待核对题。原 Word 文件未修改。
- 章节练习可选择“真题汇编（用户提供）”，练习和考试显示原文件名与题号。
- 首次启动自动入库，重启不会重复导入或清空既有答题记录；部署时必须同时上传 `server/question-banks/`，无需服务器安装 Python 或 Word。

如需从这批原文档重建数据，使用安装了 `python-docx` 的 Python 执行：`python scripts/import_docx_bank.py "原文档目录"`。导入器校验题号连续性、每章数量、四个选项、答案与解析，遇到未支持的图片、公式、表格或格式会停止，避免静默漏题。知识点为按题干关键词初步归类，难度默认“进阶”；不是官方难度评级。导入不代表已逐题验证全部知识结论或官方出处。

## 启动

需要 Node.js 24 或更新版本。

```powershell
npm install
node scripts/setup.js
npm run build
npm start
```

访问 http://127.0.0.1:5173 。开发模式使用 `npm run dev`。

## 部署到服务器

题库是应用内置的：每次启动时服务会自动扫描 `server/question-banks/*/manifest.json`，把缺失或更新的内置题同步到服务器的 `DATA_DIR/netwise.sqlite`，不会清空已有答题记录。当前包含 506 道软考题和 400 道 HCIA-Datacom 题。答题记录、错题、掌握度、复习队列和 AI 用量也持久化在这个数据库中。部署时先用完整依赖执行 `npm install` 和 `npm run build`，再用 `npm start` 运行；构建后可执行 `npm prune --omit=dev` 删除开发依赖。

## 扩展题库

题库采用证书目录和清单自动发现机制。新增证书时复制一个证书目录，修改 `manifest.json`，再把题目 JSON 放到清单指定的文件或目录中即可；核心数据库、API、注册证书列表和前端来源筛选都不需要修改。清单可声明证书版本、考试代码、公开来源、考点模块、知识点、目标题量与本站抽题权重。题目可按考点拆成多个文件；启用大纲时，加载器会阻止不属于清单模块的章节进入题库。

完整格式和示例见 [题库扩展约定](server/question-banks/README.md)。修改题库后执行：

```powershell
npm run bank:validate
npm run bank:hcia:supplement
npm run bank:hcia:import-h12-811
npm test
```

生产环境建议让 Nginx/Caddy 负责 HTTPS，并把 Node 只绑定在内网或本机：

```bash
export PORT=5173
export BIND_HOST=127.0.0.1
export ALLOWED_HOSTS=learn.example.com
export TRUST_PROXY=1
export COOKIE_SECURE=1
export DATA_DIR=/var/lib/netwise
export AI_MASTER_KEY='<随机的 32 字节 base64 密钥>'
npm start
```

反向代理必须把原始 `Host` 转发给 Node，并将 `/` 和 `/api/` 都代理到该端口。`ALLOWED_HOSTS` 是逗号分隔的域名/IP；未设置时只允许本机访问。不要把 `DATA_DIR`、`.env` 或 `AI_MASTER_KEY` 放进 Git。首次部署可以运行 `node scripts/setup.js` 生成 `.env`，再将它作为服务器机密保存。题库不会从用户浏览器上传，始终由服务器数据库提供。

首次访问必须注册或登录，再选择报考证书。当前提供“软考中级网络工程师”和“HCIA-DATACOM”；题目根据内置证书标签筛选，章节、专项练习和考试题池会随选择变化。账号密码使用随机盐的 `scrypt` 哈希保存，会话使用 HttpOnly Cookie。公网 HTTPS 部署应设置 `COOKIE_SECURE=1`。`DATA_DIR` 需要挂载到持久磁盘并定期备份；容器或进程重建时不能使用临时目录。

`scripts/setup.js` 首次运行会生成随机 AES-256-GCM 主密钥，存入被 Git 忽略的 `.env`；不会输出密钥，也不会覆盖已有配置。后端从环境变量 `AI_MASTER_KEY` 读取主密钥。也可以由系统环境提供此值。不要遗失它，否则已保存的 API Key 无法解密，需要重新填写。

## AI 设置

进入“设置 → AI 设置”，填写 Base URL（例如 `https://your-provider.example/v1`）、API Key、准确的模型名称和 Temperature，保存后测试连接。网站不再强制设置 `max_tokens`，输出长度由模型服务商和模型自身决定。

接口为 `POST {Base URL}/chat/completions`，不绑定特定厂商。远程地址要求 HTTPS；本机模型可使用 `http://localhost:11434/v1`。模型需要支持对话和 JSON 文本输出。请求不携带 `max_tokens`，避免不同服务商对参数名称和数值范围的兼容错误；如果模型自身输出上限较低，减少一次生成的题量即可。服务端默认允许单次 AI 返回最多 16 MB，可通过 `AI_RESPONSE_MAX_BYTES` 调整。

保存过的 API Key 不回传前端；显示/隐藏按钮仅切换当前正在输入的新 Key。原 Key 可通过输入新值修改，或通过删除按钮移除。AI 未配置、无余额或故障时，普通练习、错题本、复习排期和模拟考试仍可使用。

## 学习功能

- 章节练习、单选/多选、答题解析、错题本、到期复习、限时模拟考试与刷新续考。
- 错误作答自动分析具体原因（配置 AI 时）；错题页可重新分析，并生成 3/5/10 道变式训练。
- 批量生成、Zod Schema 校验、数字换皮去重、IPv4 计算复核、独立 AI 质量审核。整批验证成功后才写入队列，失败最多重试 3 次。
- AI 老师结合原题、选择、正确答案与掌握度；三级提示另外经过泄露答案检查，完整讲解在提交或主动查看答案后开放。
- 掌握度综合累计/近期正确率、练习量、连续表现与遗忘时间；变式题结果计入原知识点。少量偶然答对不会直接达到掌握。
- 错题复习间隔为 1、3、7、14、30 天，连续正确延长，再次答错重置。
- 每日薄弱点和 30 题学习计划，点击计划进入对应 AI 训练。服务运行期间按上海日期每日自动分析（需有答题记录及 AI 配置），同日复用结果，可手动刷新。服务关闭期间不执行任务，下次启动后补做当日分析。
- AI 训练题只接受服务端生成流程写入：后端完成结构校验和独立质量审核后，以当前账号的独立题组保存到 SQLite；浏览器不能上传或修改题目正文、答案与解析。待完成队列按账号和证书隔离，复用时不调用 API。设置页展示今日/累计调用量以及服务返回的输入、输出、总 Token；未返回 usage 的请求单独计数，不推测消耗。
- “章节练习 → 题库来源”可选择加入同证书其他用户生成的 AI 题。共享接口不返回原作者、题组、答案或解析；作答后才由服务器判分，个人错题、复习排期和 AI 错因分析互不影响，也不会完成原作者的训练队列。

## 数据与运行边界

这是小规模账户学习应用，默认绑定 `127.0.0.1`；通过 `BIND_HOST`、`ALLOWED_HOSTS` 和反向代理可部署到服务器。API 校验 Host 和 Origin，拒绝跨站访问。题库、账号、答题记录、复习、加密后的 Key、队列和用量在 `DATA_DIR/netwise.sqlite`；密钥明文只在后端解密调用时短暂存在内存，不进入数据库或日志。

备份时停止服务，再备份 `data/` 与 `.env`，将 `.env` 作为敏感凭证保管。不要提交 `.env`、数据库或日志。日志工具自动脱敏 Authorization、API Key、Bearer Token；错误消息不透传服务商返回的响应正文。

AI 内容不能保证完全无误。程序校验覆盖可识别的 IPv4/CIDR 网络地址、广播地址、首末可用地址、可用主机数和地址范围；其他概念题由独立 AI 审核。生成题始终标注“AI 生成练习题”。

## 验证

```powershell
npm test
npm run build
npm run test:e2e
```

Windows 浏览器测试使用已安装的 Microsoft Edge；其他平台需先运行 `npx playwright install chromium`。端到端测试使用临时数据库和确定性 AI 测试桩，不修改个人学习记录，不消耗真实 API 额度。截图保存在 `test-output/`。

真实服务兼容性仍取决于用户填写的地址、模型、权限和余额；内置连接测试用于验证实际配置。

## 文件结构

- `server/ai.js`：Provider 接口、兼容 API、重试、质量审核、老师、学习计划。
- `server/domain.js`：题目 Schema、IPv4 验证、掌握度、难度与间隔复习。
- `server/security.js`：加密、地址校验、脱敏。
- `server/store.js`：SQLite 持久化和事务。
- `server/index.js`：HTTP API、每日任务与前端服务。
- `src/main.jsx`、`src/style.css`：全部学习页面及响应式布局。
- `test/`：领域、安全、HTTP 接口、故障降级和浏览器流程测试。

页面机房图片来自 Unsplash：`photo-1558494949-ef010cbdcc31`，已下载到 `public/network-rack.jpg`，运行时无需远程加载。
