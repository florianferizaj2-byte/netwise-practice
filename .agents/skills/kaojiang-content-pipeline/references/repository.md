# 当前项目接入地图

这是定位说明，不是固定统计。每次运行 `inspect` 和现有 `bank:validate` 获取当前状态；仓库可能同时有其他任务在补内容。

## 证书与题库

- `server/question-banks/<certificate-id>/manifest.json`：证书、banks、syllabus、taxonomy、guidePath。`loader.js` 自动扫描；通常不用把新证书硬编码进客户端。
- `server/question-banks/loader.js`：从目录递归读取 JSON，补 source、sourceLabel、certificates，执行实际 Schema、分类路径、来源唯一性、章节范围及跨证书 ID 一致性检查。`bank.format === "references"` 通过 questionId 引用原题，分类覆盖保存在 certificateScopes。
- `server/domain.js`：`questionSchema`、`validateQuestion`、`verifyCalculation`；`question-similarity.js` 是现有相似度逻辑。离线批次另做全库比对、选项换序和数字变式检查，不能用它替代运行时校验。
- `server/question-banks/taxonomy.js`：`createTaxonomyIndex` 和 `assertQuestionTaxonomy`。三级是 module → section → knowledgePoint，leaf 有 code、scope；题目 chapter/knowledgeSection/knowledgePoint 必须精确对应。
- `server/question-banks/scopes.js`：同一道共用原题按证书读取分类时必须使用 `questionForCertificate`，不能只数原始 chapter。
- `scripts/validate-question-banks.js`、`scripts/report-bank-coverage.js`：现有结构验收及覆盖报告。报告里“目标”来自 manifest；已达目标题量不证明知识覆盖或正确性。

题目类型以当前源码为准：现有 Schema 已支持 single_choice、multiple_choice、true_false、short_answer。旧操作文档只列前三种的内容已落后于源码；不要擅删简答题。short_answer 使用空 options/answer 和 expectedAnswer，不能把它伪装为单选题。

## 数据、版本与缓存

内置题随启动同步到 SQLite，不直接编辑生产库。`server/store.js` 的 `invalidateQuestions()` 是题目缓存失效入口，删除墓碑不能因补题被清除。新增/编辑内容链检查 `questions.data → allQ → certificateQuestions → publicQuestion/privateQuestion → API → 各客户端缓存`。

`server/study-content.js`、`server/study-seeds/` 使用知识目录和种子生成课程节点与内容版本。目录调整会影响已发布精讲、队列、学习进度和错题知识点映射；先查当前调用再迁移。保留 ID，按新语义更新版本及映射，不把重置用户记录当迁移。

## 模拟考试

实际链路是 `server/exams.js → server/syllabus.js`。普通组卷按章节权重分层；固定结构使用 syllabus.examBlueprint。共用案例通过完整 question unit 选择；目前部分非固定抽题可能为保全案例产生题量偏差，`exam-smoke` 会暴露这种情况。

当前考试池排除 source 为 ai_generated 的题和 short_answer，但不会自动排除所有第三方未核验题。需要“审核合格正式池”时，必须把可考试资格显式接入服务端筛选，并覆盖旧记录兼容及测试；不能把一个新 category 字段当成已生效的隔离规则。

章下的知识点权重目前不会被 `stratifiedSample` 自动消费。`blueprint` 的知识点名额用于内容生产计划；若用户要求知识点比例直接控制模拟考试，需要实现并验证对应抽题逻辑，不能只改 manifest。

## Web 精讲与渲染

- 课程：`server/demo-tutor/banks/*.js`、`authoring.js`、`registry.js`、`curriculum-index.json`。
- 严格协议：`server/demo-tutor/protocol.js`。状态机：`engine.js`。
- 正式业务入口：`server/interactive-tutor.js`，通过 `/api/tutor/v1/*` 接入登录/会员、当前 studyNode 版本、已发布内容与私有会话。
- 用户界面：`src/features/interactive-tutor.jsx` → `src/generated/tutor-renderer.js`；生成源是 `public/demo/home-blue/tutor-renderer.js`。
- `scripts/export-web-tutor-renderer.mjs` 导出渲染器；`scripts/export-tutor-curriculum.mjs` 导出公共索引；`scripts/audit-network-tutors.mjs --check` 校对注册表与公共目录。

registry 的 ready 只是已编写课程目录状态。正式 API 还会按当前节点版本、已发布内容和账号条件过滤，不能用 ready 总数冒充线上可用课程数。旧演示课程存在显式映射/修正版；目录不一致时先读 `curriculum-corrections.js` 和正式入口，不能机械覆盖。

## 按实际修改执行检查

题库接入：现有规范要求 bank:validate、npm test、npm run build 和浏览器流程。批次 `verify` 顺序调用这四关；不安装依赖、不改生产环境、不推送。

只维护本 skill 时运行：

```powershell
node --test .agents/skills/kaojiang-content-pipeline/scripts/quality.test.mjs
node .agents/skills/kaojiang-content-pipeline/scripts/pipeline.mjs inspect --out tmp/content-inventory.json
node scripts/validate-question-banks.js
git diff --check
```

项目依赖 Node 24+、现有 zod；脚本无额外运行依赖。`verify` 的浏览器运行条件与项目现有 E2E 相同，失败保留具体日志。CI 或发布流程的通过状态必须来自相应运行记录。

## 已观察到的组卷缺口

2026-10-16 在当时网络工程师 1,182 道题的快照上，运行 `exam-smoke --certificate network-engineer` 默认 10 次，报告 run 3、run 8 把 intake-2026-spring-q049 / intake-2026-spring-q006 共用题组拆开。其他四个证书的同轮函数抽样检查通过，不代表它们完整考试形式均已实现。

定位：`stratifiedSample` 在无 syllabus 时直接按单题 shuffle/slice，没有使用完整 question unit；网络工程师当时没有 syllabus。后续处理应先为这个分支保留完整共用材料，再实测题量约束与章节/知识点分布；不能因为本来没有配考纲而绕过题组完整性检查。此问题属于现有组卷功能待修项，本 skill 的创建没有修改运行时考试逻辑。
