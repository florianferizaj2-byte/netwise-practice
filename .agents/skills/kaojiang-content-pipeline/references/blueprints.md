# 考纲配比、知识点覆盖与模拟考试

## 先区分四个量

- 考纲范围：哪些内容属于这个版本的考试。
- 官方分值/题型结构：有明确原文才使用，例如分值占比、实操分值、题数和时长。
- 历年样本频率：标注样本年份、场次、完整性、去重、分值映射与估计方法。
- 本站练习权重：为学习覆盖而定，不能宣传为官方命题比例。

题库里某章有多少题，不是考纲权重的依据。满目标题量、题型多、答案位置平均也不证明题目质量。

## blueprint 命令

在批次 blueprint.json 写输入，执行：

```powershell
node .agents/skills/kaojiang-content-pipeline/scripts/pipeline.mjs blueprint --batch <batch>
```

输出 blueprint-report.json，不改 manifest。字段契约在 scripts/contracts.mjs 的 blueprintSchema；输入结构：

- schemaVersion=1、certificateId、syllabusVersion、basis（official / past_papers / platform）、explanation。
- sourceIds：支持章级权重或范围的 sources.json ID；official 必须有实际打开的官方/官方镜像 weights 证据，且 examVersion 精确匹配 syllabusVersion。
- targetQuestionCount：本阶段题库目标题量，examQuestionCount：本次客观题练习目标数。两者都不自动代表正式考试结构。
- modules：id、name、weight。非样本估计模式 weight 非负且合计 100。模块 name 必须和正式目录精确对应。
- 模块可带 knowledgePoints：basis、explanation、sourceIds、points；points 有 code、name、weight（章内合计 100）。知识点权重的依据单独标明，不能从章级官方比例擅推出每个叶节点的“官方频率”。
- papers：样本估计时必填完整试卷，否则留空数组。

脚本使用最大余数法分配整数名额，章级与知识点级名额分别守恒，不靠逐项四舍五入。小总题量可能使某些知识点分配为 0；这是本批名额，不等于从长期目录删除该知识点。需要全覆盖时增大阶段目标或跨批次轮换，并记录最小覆盖要求。

如果 blueprint 不为空，check 会对照有效/拟接入 manifest 的章节权重和 targetQuestionCount，避免“报告一套比例、运行时另一套”。知识点名额目前是生产计划；现有运行时只消费章节权重。需要叶节点抽题时实际改 server/syllabus.js、后端筛选及结果分布测试再宣称生效。

## 历年样本的可复算估计

papers 每项包含 id（统一原卷年份/场次标识）、sourceId、year、syllabusVersion、complete=true、totalPoints、sampleWeight（默认 1）和 questions。questions 每项含 sourceQuestionId、contentHash（原题题干、共用材料及排序后选项的 SHA-256）、moduleId、points。

每份试卷先按分值归一化：`p(y,k) = 该卷模块 k 分值 / 该卷完整总分`。再计算 `w(k) = Σ sampleWeight(y) × p(y,k) / Σ sampleWeight(y)`。每卷同权是默认；因版本或近期性调权时在 explanation 说明，不用“越新越准”自动覆盖官方明确占比。

逐卷原始题号唯一、内容唯一、分值之和等于 totalPoints、模块全部可映射、版本一致；同一原卷跨网站重印只算一卷。脚本会阻断完全相同原卷内容重复与不完整分值映射；OCR 异体与实质同卷仍须人工合并。跨年真实重复考题保留在各自年度样本，题库中则去重，两个统计目的不能混用。

样本太少、仅回忆部分题、年份不均或题型缺失时，不声称稳定考试占比。保留范围和官方结构，以明确标注的 platform 权重安排练习；没有证据就不输出伪精确“高频 17.36%”。如需知识点样本频率，先把原题分值定位到稳定 leaf code，生成可审的归类明细，再记录叶节点权重依据。

## 生产优先级

先列考纲模块/知识点的 0 覆盖，再对照目标名额计算 gap=max(0,target-validUniqueCount)。只计可用、去重、审过的题。阶段优先考虑范围内高权重缺口和薄弱推理类型；题量已多但解析重复的知识点优先提质。来自旧版本/已失效标准的题单列，不为满足名额继续计入。

## 现有考试能力的验收

`exam-smoke` 多次调用当前 sampleExamQuestions，检查题数、唯一 ID 和完整共用材料，保留每次真实分布。它只测试抽题函数，不测试 API 或页面，也不验证“所有题都已专家审过”。遇到保全题组导致数量不符，要修正组卷或明确非固定练习性质，不能截断病例强凑题数。

接入正式模拟考试时还需核对并实测：

1. 当前证书、有效考期、官方题型和分值。short_answer 和 Office 实操目前不进入客观题考试池；缺它们时说明是局部练习。
2. 服务端范围/知识点配额、题型与难度策略、题组完整性、题源考试资格、题量不足提示。不能静默跨考纲补题。
3. 服务端计时、断线恢复、重复交卷、答案版本冲突、评分和错题归属；答案必须经 publicQuestion 隐藏，交卷后再返回允许展示的解析。
4. 浏览器从证书选择→组卷→作答→刷新恢复→交卷→成绩/错题定位走完整链；检查用户/证书切换不串题不串进度。

官方规则发生变化时，先证据与 blueprint，再实现能力和测试，最后更新指南及界面表述。不要只改一个时长/权重字段就称“完全模拟真实考试”。

## 本次已核实的检索实例

- [NCRE 2025 MS Office 官方大纲](https://ncre.neea.edu.cn/res/Home/2412/007b7cbab11984a769c33fdc605b7f85.pdf)：第 2 页的选择题与三类操作题是不同计分部分。网站现有选择题不能代替操作能力。
- [四川《计算机基础》考试要求的高校官方转发](https://zs.gingkoc.edu.cn/ueditor/php/upload/file/20240329/1711693941663940.pdf)：第 7 页给出七模块的大约分值比例；它们指导覆盖，但不自动变为每种客观题的题量比例。适用考期仍需每年实施规定确认。

这些来源是工作示例，每次变更仍需重新核对对应版本与考期。
