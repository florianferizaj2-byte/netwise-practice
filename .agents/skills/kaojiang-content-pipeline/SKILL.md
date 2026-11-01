---
name: kaojiang-content-pipeline
description: 为考匠 AceExam 新增证书、补题、导入真题、查重审核、建立章节知识点、校准考纲配比、完善模拟考试和 Web 互动精讲。适用于考匠内容生产与验收；不用于无关功能、一般知识问答或未要求实施的讨论。
---

# 考匠内容生产与验收

把“有据可查的考试范围 → 分类与目标 → 候选内容 → 查重和独立解答 → 项目接入 → 实际验收”做完整。脚本承担可计算的检查，agent 负责检索、解释、内容判断和实现。脚本通过不等于专家审核或全站发布。

## 开始与选择工作

确认仓库根目录含 `package.json`（name 为 `aceexam`）和 `server/question-banks/loader.js`，执行 `git status --short`。先完整阅读 `docs/AI-QUESTION-BANK-OPERATIONS.md`。现有用户改动不能覆盖。

以下命令均在仓库根目录执行，`<batch>` 是本次隔离目录。路径有空格时加引号。init 的证书只是用法示例，实际目标由用户要求与本次盘点决定。

```powershell
node .agents/skills/kaojiang-content-pipeline/scripts/pipeline.mjs inspect --out tmp/content-inventory.json
node .agents/skills/kaojiang-content-pipeline/scripts/pipeline.mjs init --certificate sichuan-upgrading-computer --batch tmp/content-batches/sc-computer-01
```

用户指定的证书/知识点优先。泛称扩充内容时，根据盘点中的证据、未覆盖考点与权重缺口选择批次，通常每批 10–20 道；不是机械追求题量。完整请求拆批执行，累计记录总范围、已完成、待完成，不能把一批通过说成全量完成。新增证书在 `init` 加 `--new`，先在批次内写 `manifest.proposed.json`，未通过不得加入加载目录。

按任务读取对应参考：

- 查位置、Schema 或缓存链：[repository.md](references/repository.md)。
- 联网找考纲/真题、核验出处：[research.md](references/research.md)；[source-registry.json](references/source-registry.json) 仅是带日期的检索起点。
- 编题、导入、查重、审核与批次字段：[questions.md](references/questions.md)。
- 知识点比例、样本统计与组卷：[blueprints.md](references/blueprints.md)。
- Web 动画与互动课：[web-tutors.md](references/web-tutors.md)。

## 每批执行

1. **取证。** 搜索主管机构的当前考纲、版本/考试形式，再搜索官方样题与可核验的历年题。实际打开正文或附件；搜索摘要不能通过取证。记录 URL、版本、日期、页码/题号和支持的具体结论。遇到无法访问的来源如实保留，改找官方镜像或其他可验证来源；未找到可靠真题时编写明确标注的原创仿真题。
2. **建目录与配比。** 使用精确的章节/二级分类/知识点名称及稳定 code；按最终设问确定主考点，辅考点用 tags。考纲没有公开百分比时明确使用样本估计或本站练习权重。旧目录变更先列题目、精讲、版本、缓存和各端映射影响。
3. **生产。** 在批次 `questions.json` 写候选题，`provenance.json` 写逐题证据，`sources.json` 写来源。`batch.json` 填真实 `authorContext`。从实际 Schema 编写，保留图片与共用题干的完整信息；数字题须独立计算，选项顺序变化须同步重算答案。
4. **盲解与审核。** 复核者先看题干与证据独立作答，再对照候选答案。使用独立任务上下文或真实独立复核会话；没有可用复核者时保留待审核状态。不能由作者改一个名字伪造独立复核。`hash` 生成绑定题目、来源及分类版本的摘要，复核记录写入 `reviews.json`。改题、改证据或改目录后重审。
5. **硬检查。** 运行 `check`，修正所有阻断项再继续。跨证书与同批次查重都执行；同题换选项顺序、同题换数字、答案冲突不得绕过。相似度仅是候选线索，近似题需要逐对写实质差异；不能宣称算法识别了所有语义重复。
6. **接入。** `prepare` 仅在检查通过后输出 `prepared/questions.json` 和 `manifest-bank.json`。检查拟接入清单，按其中路径复制题目、合并 bank 声明和已审核的目录；补充 guide、来源记录、taxonomy 的派生 questionCount。只提交必要的题库及可公开审核记录，隔离草稿/私有原件留在 `tmp/`。
7. **验收。** 接入后运行 `verify`：先确认实际加载内容与审核题相同，再按现有项目脚本执行题库校验、测试、生产构建和浏览器流程，并保存真实退出码。模拟考试另跑 `exam-smoke`；修改互动课另执行参考中的课程/渲染/浏览器验收。

```powershell
node .agents/skills/kaojiang-content-pipeline/scripts/pipeline.mjs hash --batch <batch>
node .agents/skills/kaojiang-content-pipeline/scripts/pipeline.mjs check --batch <batch>
node .agents/skills/kaojiang-content-pipeline/scripts/pipeline.mjs prepare --batch <batch>
node .agents/skills/kaojiang-content-pipeline/scripts/pipeline.mjs verify --batch <batch>
node .agents/skills/kaojiang-content-pipeline/scripts/pipeline.mjs exam-smoke --certificate <certificate-id> --out <batch>/exam-smoke.json
```

`check` 和 `prepare` 的退出码为 1 表示不可放行；无题、无目录、无来源、未独立复核也会失败。`verify` 必须在实际接入后执行，失败时保留日志并处理或如实报告，不删检查以制造成功。`inspect` 用于发现缺口，退出 0 不表示所有证书已达标。

## 完成标准与续做

每批记录证书/版本、题目新增或复用数、来源类别、目录覆盖、查重候选与处理、审核未决项、配比变更、测试/构建/浏览器证据，以及已接入/未接入。发布题号保持稳定；共用原题优先用现有 references 机制，不复制改名充数。

新增证书不能仅创建空 manifest；必须有可加载的有效内容、三级目录、可核验范围、证书指南与可用学习入口。客观题模拟、主观题和 Office 实操的能力边界分别报告。动画以“可解释、可操作、可验证”为标准，截图或占位组件不能算完成。

除非用户另有授权，不从生产用户数据抽取素材，不触发收费生成，不推送部署，不创建后台定时任务。断网不影响本地查重、目录盘点和脚本验收；它会阻断依赖新证据的发布。接续工作读取同一批次的报告与摘要，并重跑动态检查。
