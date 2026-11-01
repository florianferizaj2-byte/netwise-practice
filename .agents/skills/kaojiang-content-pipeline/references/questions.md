# 候选题、查重与独立审核

## 隔离批次的文件

`init` 创建 batch.json、questions.json、sources.json、provenance.json、reviews.json、blueprint.json 和 inventory.json。默认在仓库 tmp/；也可显式给外部隔离目录。脚本禁止将报告或草稿写入仓库正式源码目录。

batch.json 必填实际 authorContext 和 examVersion。authorContext/reviewerContext 使用可追溯的会话或任务标识，不能改标签假冒不同复核者。maxQuestions 是本批上限（1–50，默认 20），超出时拆批，保留总请求的进度。

新证书或需要补 taxonomy 时在批次创建完整 manifest.proposed.json。它只作为候选题分类上下文，最终仍必须经现有 loader 校验全部旧题和 guide，不能把候选题检查通过当整个 manifest 通过。

## questions.json

顶层数组。使用 server/domain.js 当前 questionSchema；不额外加来源、审核或运行代码字段。id 使用全局唯一 slug；source、sourceLabel 和 certificates 由 manifest 加载。正式 loader 虽支持 provenance/sourceVerification，隔离候选中仍统一使用 sidecar；prepare 再补充受控元数据，避免审核题与实际导出内容不一致。

单选 1 个正确项；多选至少 2 个；判断 A=正确/B=错误；简答 options={}、answer=[]、expectedAnswer 非空。解析说明推理、条件与干扰项错误原因。公式写单位和约定；有图就交付实际静态资源和文字等价描述，题干自包含。

不是把一个结论重复改成几十种题干。分配概念辨析、边界条件、计算、反向推理、实际应用和错因诊断；难度由推理需求决定。覆盖组合按目标考试真实题型设计；不能为了凑“多选数量”给不考多选的正式试卷硬加多选。

共用题干使用 sharedGroupId/sharedKind/sharedStem/sharedOrder，保留整组，sourceQuestionId 精确到子题；每条 provenance 标记 groupQuestionCount，脚本检查组内数量与连续排序。跨证书同原题用 loader 的 references 机制，不复制内容改 ID。

## provenance.json

逐题一个记录：

```json
{
  "questionId": "本题合法-id",
  "sourceIds": ["current-scope", "technical-reference"],
  "locator": "自编题；依据范围条款和技术文档对应小节",
  "category": "syllabus_practice",
  "reuse": "original",
  "reuseBasis": "根据公开考纲独立设计题干、选项与解析，未复制第三方题目"
}
```

真实 category 为 official_sample、verified_past_exam、public_practice、syllabus_practice、unverified_collection。一个批次的 category 与 batch.bank.category 一致；不同性质的题分批。unverified_collection 一直保持隔离，不能通过 prepare 发布。

reuse 为 original、licensed、user_authorized、permission_recorded、link_only。original 只用于 syllabus_practice；其余依据写具体。官方样题/已核验真题还需 sourceQuestionId 和实际出版证据，真题补 examYear；仅凭机构分类不能成为 verified_past_exam。link_only 不导出题目正文。

## 独立解答与摘要

先完成取证与出题，再执行 `hash --batch <batch>` 得到 review-inputs.json。每个 digest 绑定题目、逐题来源、引用记录和有效 taxonomy/syllabus。候选答案、来源说明或考点范围改动均需重审；派生 questionCount 调整不改变知识点语义。

审核输入先隐藏候选答案与解析，提供题干、选项、范围和参考资料；复核者写推理及答案后再看候选，逐项核对。能使用独立上下文时在真实独立上下文复核；未得到复核结果就留空 reviews.json。不要把脚本生成空字段、模型自称专家或同作者改名算独立审题。

reviews.json 每题一个记录：

```json
{
  "questionId": "本题合法-id",
  "digest": "从 review-inputs.json 复制的64位摘要",
  "reviewerContext": "实际复核会话或任务标识",
  "verdict": "pass",
  "independentAnswer": ["A"],
  "blindReasoning": "先独立记录完整推理，再说明与候选答案的核对结果。至少解释判断所依的条件。",
  "checks": {"scope": true, "answer": true, "analysis": true, "distractors": true, "wording": true, "source": true, "classification": true},
  "calculation": {"applicable": false, "method": "说明为什么这道题不涉及数值计算", "result": "不适用", "passed": true},
  "duplicates": []
}
```

简答题改用 independentExpectedAnswer，复核者先给等价答案，再将已确认的规范表达记录为 expectedAnswer；复杂评分标准的正确性仍需实质审核。数字计算 applicable=true，写算法/公式、独立结果和验证。现有 verifyCalculation 只覆盖部分 IPv4 明确题型；checked=false 不是数值正确的证据，其他公式需要独立复算。

## 查重的实际含义

脚本对当前所有证书和本批题目比较：ID、规范化题干与排序后的选项文本、换数字模式、二元字符相似度。精确重复和答案冲突、相同题干、只换数字、相似度 ≥0.9 阻断。0.78–0.9 为复核候选；两阈值是本工具策略，不是所有语义重复的数学界限。`quality-report.json` 给每个命中对象的摘要。

近似题确有不同设问/推理时，在该题 review.duplicates 记录 otherId、otherDigest、decision=distinct 和 ≥20 字符的具体差异理由。对方题或本题变动后重新判断。硬性重复不能靠“distinct”放行；改写到实质不同，或去掉重复候选并用共用引用机制。

## 接入与验收证据

纠错批次使用新题号，`provenance.replacement` 写明 `questionId`、`certificateId`、原题 `digest` 和具体 `reason`。原题必须仅属于本证书、摘要保持一致，且有实质修改；独立复核摘要会绑定替换关系。此例外仅允许替换指定基线，其他题目的硬重复仍阻止导出。运行时保留旧题及历史并下架旧版本，不允许借此覆盖共用题或免除独立复核。网页交接包操作见 `docs/admin-console.md`。

check 成功后 prepare 才导出 loader 可读题目、拟添加 bank 和 integration.json。它不改正式题库、不替你提交。导出后候选有变动时，重新审核、检查、prepare；不要复制遗留的旧 prepared 文件。

复制已审题目、合并 bank、更新分类派生计数与必要的公开报告后，再运行 verify。verify 检查实际加载题与批次一致，并顺序执行 bank:validate、test、build、test:e2e 与 git diff --check。每步保存退出码与日志，第一项失败停止后续执行，未执行项不算通过。它不会验证部署、生产服务或互动课专项浏览器验收。
