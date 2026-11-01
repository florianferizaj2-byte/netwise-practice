# 新证书生成 · 提示词（交给其他 AI 用）

---

## 一、先把 skill 的位置说清楚

你问的 skill **不在全局目录，是这个仓库自带的**：

```
C:\Users\周凯鑫\Documents\ChatGPT\aceexam\.agents\skills\kaojiang-content-pipeline\
├── SKILL.md                     ← 入口（57 行，必须先读）
├── agents\openai.yaml
├── references\
│   ├── repository.md            ← Schema / 加载链 / 缓存
│   ├── questions.md             ← 编题 / 查重 / 复查字段
│   ├── research.md              ← 联网取证 / 来源核验
│   ├── blueprints.md            ← 知识点配比 / 组卷
│   ├── web-tutors.md            ← 互动课 / 动画
│   └── source-registry.json     ← 带日期的检索起点
└── scripts\
    ├── pipeline.mjs             ← 主流程 CLI（inspect/init/hash/check/prepare/verify/exam-smoke）
    ├── contracts.mjs
    ├── quality.mjs
    └── quality.test.mjs
```

我核对过：`~/.agents/skills`、`~/.codex/skills`、`~/.cursor/skills` 里**都没有**这个 skill，所以它是仓库内的私有 skill。

⚠️ **一个重要风险**：`.agents/` 目录**没有被 git 跟踪**（`git ls-files .agents` 返回 0，也没被 gitignore）。也就是说：

- 它只存在于你**这台机器的这个工作区**里；
- 如果别的 AI 是通过 `git clone` 拿到仓库，**它看不到这个 skill**；
- 如果工作区被清理或换机器，skill 就没了。

所以交给其他 AI 之前，请先确认它拿到的是**这个工作区**（而不是 clone 出来的干净副本）。如果你打算长期用，建议把 `.agents/` 纳入版本库，或者至少备份一份。

---

## 二、怎么用这份提示词

1. 打开仓库根目录，让 AI 在这里工作（有读写权限最好）。
2. 复制下面第三节**代码块里的全部内容**，粘贴给 AI。
3. 把里面 `<尖括号>` 的地方替换成你的真实信息（证书名、id、目标题量等）。
4. 建议**第一轮只让它做 10–20 题**，你看一眼质量再放量——这是 skill 自己推荐的批次大小。

---

## 三、提示词正文（复制下面整段）

```text
# 任务：为考匠 AceExam 新增一个考试证书题库

你是内容生产 agent，工作目录是考匠（AceExam）仓库根目录。
请严格按下面流程执行。不得跳步、不得编造、不得为了让检查通过而降低标准。

════════════════════════════════════
0. 环境自检（必须先做，做完先向我汇报）
════════════════════════════════════
1) 确认当前目录含 package.json（name 必须是 "aceexam"）与 server/question-banks/loader.js。
2) 确认 skill 存在：.agents/skills/kaojiang-content-pipeline/SKILL.md
   如果不存在，立即停下来告诉我「skill 缺失」，不要自己发明流程。
3) 执行 git status --short，记下已有未提交改动。
   这些是其他人的工作：你不能覆盖、不能回退、不能 git checkout / git clean / git stash。
4) 完整阅读（不要只看标题、不要凭印象）：
   - .agents/skills/kaojiang-content-pipeline/SKILL.md
   - docs/AI-QUESTION-BANK-OPERATIONS.md
   再按需读 references/ 下的 repository.md（Schema与加载链）、questions.md（编题与查重）、
   research.md（取证）、blueprints.md（配比）。
5) 读完后向我复述：这个仓库要求一批多少题、check 与 prepare 的退出码含义、
   什么情况下必须重新复审。复述不对就停下来，不要继续。

════════════════════════════════════
1. 本次目标证书
════════════════════════════════════
- 证书名称：<填考试全称，例如：全国计算机等级考试二级 Python 程序设计>
- 证书 id：<kebab-case，例如 ncre-l2-python-programming，必须与目录名一致>
- 考试主管机构：<例如：教育部教育考试院>
- 考纲：<名称与年份；如果你无法确认，就自己检索并给我证据>
- 目标题量：<例如 300。不确定就先做 10–20 题，等我确认后再放量>
- 排序 order：<新证书在列表中的位置，问我要，或自动取当前最大值+1>

════════════════════════════════════
2. 取证（不许跳过，不许用搜索摘要当证据）
════════════════════════════════════
1) 检索并**实际打开**主管机构发布的当前版本考试大纲正文或附件。
   记录：URL、版本/年份、访问日期、页码或题号，以及它支持的具体结论。
   搜索摘要、二手转载、培训机构宣传**都不能作为取证**。
2) 从考纲里逐字确认以下几项，并报告给我：
   - 考试形式与总时长
   - 题型构成与分值（客观题有哪些题型？单选？多选？判断？实操题？）
   - 考试范围（章节/模块清单）
   - 考试环境（软件/版本/操作系统，如果考纲有写）
3) 题型必须由考纲决定，**不要默认单选**。
   如果考纲的客观题部分只有单选题，就只出单选题；
   如果有多选题/判断题，就按真实题出，并如实标注 type。
   如果这门考试根本没有客观题，直接告诉我，不要硬造。
4) 如果官方大纲无法访问，如实报告，改用官方镜像并结合可验证的二手来源，
   但必须在来源记录里写清楚哪一条是二手。
5) 找不到可靠真题时，编写**明确标注的原创仿真题**，不要冒充真题。

════════════════════════════════════
3. 目录与配比
════════════════════════════════════
1) 执行：
   node .agents/skills/kaojiang-content-pipeline/scripts/pipeline.mjs init \
     --certificate <证书id> --batch tmp/content-batches/<批次名> --new
2) 在批次目录里编写 manifest.proposed.json，包含：
   - certificate（id 必须等于目录名、name、shortName、description、order）
   - syllabus（模块清单 + 权重 + targetQuestionCount，权重合计必须为 100）
   - taxonomy（三级：模块 → 二级分类 → 知识点，知识点要有稳定 code 和 scope）
   - banks（source 在**全库唯一**，path 指向该证书自己的题库文件）
3) 目录要求：
   - **三级结构**，每个知识点都要写 scope（考查边界）
   - 名称必须稳定，一旦入库就不要改名（会破坏已发布题目与各端映射）
   - 权重必须有依据：考纲写了分值就用分值；没写就明确标注"本站练习权重"，
     不能拿机构宣传或现有题量反推考纲占比
4) 配比按加权分配：模块目标题量 = 该模块权重% × 总目标题量。
   先把表算好给我看，我确认后再出题。

════════════════════════════════════
4. 出题（一批写成 questions.json）
════════════════════════════════════
每题字段（严格 11 个，不多不少）：
id, type, question, options, answer, analysis, chapter, knowledgeSection,
knowledgePoint, difficulty, tags

硬性要求：
1) chapter / knowledgeSection / knowledgePoint 必须**逐字**匹配 taxonomy（含空格和标点）。
2) 每题只考一个知识点，并归到对应叶子节点。
3) 单选题：恰好 4 个选项、恰好 1 个正确答案，另外 3 个必须**确实错**。
   多选题：正确项集合必须唯一且完整。
4) **忽略大小写后选项文本不能重复**（加载器会把选项转小写后比对）。
5) 解析必须写出推理过程，并说明其它选项为什么不对；
   **不要用"选项 A""B 项"这种字母指代**，要用内容描述。
6) 题干必须自包含：禁止"如下图""见下表"。
7) 正确答案位置在 A/B/C/D 之间均衡（各约 22%–28%），
   **但不要用脚本机械轮转选项位置**——会破坏题目逻辑。
8) 同一知识点的题要换角度（概念辨析、执行跟踪、边界条件、反向推理、错因诊断），
   不能只换数字。
9) 严禁依赖未定义行为或未指定求值顺序。
10) 依赖实现取值的题（如 sizeof、类型字节数、对齐），**必须把前提写进题干**，
    不要只写"在某编译器环境下"就要求算。
11) 数字题必须自己独立算一遍，答案与解析要一致。
12) 不要照抄真题、教辅或网络题库原文。

════════════════════════════════════
5. 来源与复核（最容易出错，务必按此执行）
════════════════════════════════════
1) sources.json 记录来源：id、标题、URL 或文件哈希、authority
   （official / official_mirror / standard / secondary）、access（必须是 opened）、
   checkedAt、claims（每条 claim 写清 kind 与 locator）。
2) provenance.json 逐题写：sourceIds、locator（对应三级目录位置）、
   category、reuse（original / adapted）、reuseBasis。
   **官方范围证据只能证明"这题在范围内"，不能证明"答案为什么对"**——
   知识点解答需要另找适用的标准/技术文档，或属于可独立复算/证明的稳定结论。
3) 盲审：找**独立复核者**（另一个独立任务上下文，不能是你自己改名），
   先只看题干+选项+scope 独立作答，再对照答案。
   复核结果写入 blind-result-*.json，字段含 independentAnswer、blindReasoning、
   checks（scope/answer/analysis/distractors/wording/source/classification 七项）、
   calculation、concerns。
4) 跑 hash 生成摘要，再把复核记录整理成 reviews.json。
5) **改题目正文、改来源、改目录，都会让摘要失效，必须重新盲审**，不能沿用旧复核。
   **新增任何来源都会让整批摘要失效**（摘要绑定了整个来源清单），改完来源要重跑 hash。

════════════════════════════════════
6. 硬检查（不通过不许往下走）
════════════════════════════════════
node .agents/skills/kaojiang-content-pipeline/scripts/pipeline.mjs check --batch <批次>
- 退出码 1 = 不可放行，必须修完所有阻断项。
- 查重会同时做跨证书与同批次；"同题换选项顺序""同题换数字"都不许绕过。
- 相似度只是候选线索，近似题要逐对写出实质差异。
- 不能删检查、降阈值、改报告状态来制造通过。

════════════════════════════════════
7. 接入
════════════════════════════════════
node .agents/skills/kaojiang-content-pipeline/scripts/pipeline.mjs prepare --batch <批次>
- 只有 check 通过后 prepare 才会输出 prepared/questions.json 与 manifest-bank.json。
- 按 prepared 清单把题目并入该证书**唯一的**题库文件；
  **不要新建第二个 bank**（同一证书的 source 必须唯一）。
- 同步调高 manifest.json 里各模块的 targetQuestionCount 到实际题量，否则配比校验不过。
- 若题库里已有同 id 的旧副本（修订过题目），必须**同步更新题库里的那份**，
  否则查重会把它和旧副本比成"自己撞自己"。
- 更新 guide（备考指南）与 taxonomy 的派生统计。
- 草稿、私有原件、未审核内容留在 tmp/，不要提交。

════════════════════════════════════
8. 验收（接入之后才做）
════════════════════════════════════
node .agents/skills/kaojiang-content-pipeline/scripts/pipeline.mjs verify --batch <批次>
它会依次跑：bank:validate → npm test → npm run build → npm run test:e2e → git-diff-check
必须全部通过（ok: true）才算完成；保存真实退出码与日志。
失败时如实报告并修复，不要删检查。

════════════════════════════════════
9. 汇报要求
════════════════════════════════════
每批完成后向我报告：
- 证书 / 考纲版本 / 批次名
- 新增题数、题型、难度分布、答案位置分布
- 三级目录：模块数 / 二级分类数 / 知识点数，覆盖面
- 来源类别（official 几条、standard 几条、二手几条）
- 查重结果与处理
- check / prepare / verify 的真实退出码
- 哪些已接入、哪些未接入
- 遗留问题与未决项

严禁：
- 把"一批通过"说成"全量完成"
- 把"本地校验通过"说成"已发布"
- 伪造来源、伪造复核、伪造退出码
- 未经我同意推送、部署或触发收费生成

════════════════════════════════════
10. 现在开始
════════════════════════════════════
先只做第 0 步和第 2 步（环境自检 + 取证），把结果和证据报告给我，
等我确认考纲与题型之后再继续建目录。
```

---

## 四、给你的验收清单（AI 交活后自己核对）

别只看它说"完成了"，逐条核：

| 检查项 | 怎么核 |
|---|---|
| skill 真的读了 | 让它复述"一批多少题""check 退出码 1 什么意思" |
| 考纲是真的 | 要它给 URL + 页码 + 你亲自打开看一眼 |
| 题型对得上 | 对照考纲的"题型构成"，多选/判断有没有漏 |
| 目录合规 | `node -e` 加载一遍，看是否报 taxonomy / 权重错误 |
| 题目能加载 | `npm run bank:validate` 必须 exit 0 |
| 配比达标 | 看每个模块实际题量 = targetQuestionCount |
| 不是换数字凑数 | 随机抽 5 道同知识点的题，看角度是否真的不同 |
| 干扰项站得住 | 抽几道数值题，按解析的错误思路自己算一遍 |
| 复核是真独立 | 问它复核者的输入里有没有答案；作者不能自审 |
| 接入方式对 | 确认没新建第二个 bank 文件 |
| 四关全过 | `verify` 必须 ok: true，而且你要看真实输出 |

---

## 五、如果你的 AI 没有仓库权限

那它跑不了 `pipeline.mjs`，只能出题。此时把提示词里的第 3、5、6、7、8 步改成：

> 只交付 `questions.json`（11 字段数组）与 `sources.json`（来源清单），
> 由我在仓库里用 skill 完成 hash / 复核 / check / prepare / verify。

其余约束（题型、目录名逐字一致、去重、干扰项可导出、不依赖未定义行为等）**一条都不能放松**——这些是内容质量要求，和有没权限无关。
